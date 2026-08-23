'use strict';
(() => {
  const SAMPLE_RATE = 8000;
  const SAMPLES_PER_FRAME = 160;
  const FRAME_MS = 20;
  const CHUNK_FRAMES = 5;
  const CHUNK_MS = FRAME_MS * CHUNK_FRAMES;
  const DEFAULT_BUFFER_MS = 160;
  const CALL_GAP_MS = 500;
  const AUTO_LOCK_GAP_MS = 450;
  const AUDIO_POLL_MS = 100;
  const IDLE_POLL_MS = 250;
  const MIN_START_LEAD_MS = 40;
  const RESERVOIR_DEADBAND_MS = 20;
  const RESERVOIR_GAIN_MS = 3500;
  const MIN_PLAYBACK_RATE = 0.98;
  const MAX_PLAYBACK_RATE = 1.02;
  const HARD_REANCHOR_EXTRA_MS = 400;
  const MAX_PENDING_FRAMES = 15;

  let audioCtx = null;
  let gainNode = null;
  let audioRunning = false;
  let primed = false;
  let nextAudioTime = 0;
  let scheduledSources = new Set();
  let sourceFilter = 'network';
  let slotFilter = 'auto';
  let targetBufferMs = DEFAULT_BUFFER_MS;
  let volume = 0.70;
  let muted = false;
  let decodedFrames = 0;
  let decodedChunks = 0;
  let decoderErrorFrames = 0;
  let underruns = 0;
  let streamResets = 0;
  let autoHandoffs = 0;
  let reservoirReanchors = 0;
  let currentPlaybackRate = 1.0;
  let lastFrameSourceMs = 0;
  let previousKey = null;
  let previousBurst = null;
  let previousDmrSeq = null;
  let autoLockKey = null;
  let autoLockSlot = 0;
  let autoLockLastSourceMs = 0;
  let activeRoute = '—';
  let statsTimer = null;

  let ambeQueue = [];
  let workerRunning = false;
  let resetRequested = false;
  let audioGeneration = 0;
  let streamEpoch = 0;
  let backendIdentity = null;

  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function ambeBits(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!/^[0-9a-f]{13}$/.test(text)) throw new Error(`invalid AMBE49 value: ${value}`);
    const raw = BigInt(`0x${text}`);
    if ((raw & 7n) !== 0n) throw new Error(`non-zero AMBE49 padding: ${value}`);
    return raw.toString(2).padStart(52, '0').slice(0, 49);
  }

  function frameKey(frame) {
    return [frame.path || '', Number(frame.slot) || 0, Number(frame.src) || 0, Number(frame.dst) || 0, frame.group ? 1 : 0].join(':');
  }

  function frameTimeMs(frame) {
    const value = Number(frame.t);
    return Number.isFinite(value) && value > 0 ? value * 1000 : performance.now();
  }

  function frameMatchesBase(frame) {
    if (sourceFilter !== 'all' && String(frame.path) !== sourceFilter) return false;
    if (slotFilter !== 'auto' && Number(frame.slot) !== Number(slotFilter)) return false;
    return true;
  }

  function acquireAutoLock(key, slot, sourceMs, isHandoff) {
    if (isHandoff) autoHandoffs += 1;
    autoLockKey = key;
    autoLockSlot = slot;
    autoLockLastSourceMs = sourceMs;
  }

  function autoLockAccept(frame, sourceMs) {
    if (slotFilter !== 'auto') return true;
    const key = frameKey(frame);
    const slot = Number(frame.slot) || 0;
    if (autoLockKey === null) {
      acquireAutoLock(key, slot, sourceMs, false);
      return true;
    }
    if (key === autoLockKey) {
      autoLockLastSourceMs = Math.max(autoLockLastSourceMs, sourceMs);
      return true;
    }
    if (slot === autoLockSlot) {
      acquireAutoLock(key, slot, sourceMs, true);
      return true;
    }
    if (autoLockLastSourceMs && (sourceMs - autoLockLastSourceMs) >= AUTO_LOCK_GAP_MS) {
      acquireAutoLock(key, slot, sourceMs, true);
      return true;
    }
    return false;
  }

  function routeText(frame) {
    const prefix = slotFilter === 'auto' ? 'AUTO · ' : '';
    return `${prefix}${String(frame.path || '?').toUpperCase()} · TS${Number(frame.slot) || 0} · ${Number(frame.src) || 0} → ${frame.group ? 'TG' : 'PC'} ${Number(frame.dst) || 0}`;
  }

  function setAudioState(text, tone = '') {
    const node = $('rxAudioState');
    if (!node) return;
    node.textContent = text;
    node.className = `rx-audio-state${tone ? ` ${tone}` : ''}`;
  }

  function setDecoderState(text, tone = '') {
    const node = $('rxDecoderState');
    if (!node) return;
    node.textContent = text;
    node.className = `rx-audio-state${tone ? ` ${tone}` : ''}`;
  }

  function setAudioNote(text) {
    const node = $('rxAudioNote');
    if (node) node.textContent = String(text || '');
  }

  async function ensureAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio is not supported by this browser');
      audioCtx = new AudioContextCtor();
      gainNode = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    applyGain();
    return audioCtx;
  }

  function applyGain() {
    if (!gainNode || !audioCtx) return;
    gainNode.gain.setValueAtTime(muted ? 0 : volume, audioCtx.currentTime);
  }

  function stopScheduledSources() {
    for (const source of scheduledSources) {
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
    }
    scheduledSources.clear();
  }

  function resetLocalPipeline({stopSources = false, unlockAuto = true} = {}) {
    if (stopSources) stopScheduledSources();
    ambeQueue = [];
    primed = false;
    nextAudioTime = 0;
    currentPlaybackRate = 1.0;
    previousKey = null;
    previousBurst = null;
    previousDmrSeq = null;
    lastFrameSourceMs = 0;
    activeRoute = '—';
    streamEpoch += 1;
    if (unlockAuto) {
      autoLockKey = null;
      autoLockSlot = 0;
      autoLockLastSourceMs = 0;
    }
    renderStats();
  }

  function scheduleChunk(pcm, when, rate) {
    const buffer = audioCtx.createBuffer(1, pcm.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(pcm);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(rate, when);
    source.connect(gainNode);
    scheduledSources.add(source);
    source.onended = () => {
      scheduledSources.delete(source);
      try { source.disconnect(); } catch (_) {}
    };
    source.start(when);
  }

  function scheduledDepthMs() {
    if (!audioCtx || !primed) return ambeQueue.length * FRAME_MS;
    return Math.max(0, Math.round((nextAudioTime - audioCtx.currentTime) * 1000));
  }

  function controlledPlaybackRate(nominalMs) {
    if (!audioCtx || !primed) return 1.0;
    const depthBeforeMs = Math.max(0, (nextAudioTime - audioCtx.currentTime) * 1000);
    const projectedMs = depthBeforeMs + nominalMs;
    const errorMs = projectedMs - targetBufferMs;
    if (Math.abs(errorMs) <= RESERVOIR_DEADBAND_MS) return 1.0;
    const signedExcess = Math.sign(errorMs) * (Math.abs(errorMs) - RESERVOIR_DEADBAND_MS);
    return clamp(1 + (signedExcess / RESERVOIR_GAIN_MS), MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
  }

  function primeAndScheduleChunk(chunk, nominalMs) {
    const startLeadMs = Math.max(MIN_START_LEAD_MS, targetBufferMs - nominalMs);
    nextAudioTime = Math.max(audioCtx.currentTime + (startLeadMs / 1000), nextAudioTime || 0);
    currentPlaybackRate = 1.0;
    scheduleChunk(chunk, nextAudioTime, currentPlaybackRate);
    nextAudioTime += (nominalMs / 1000) / currentPlaybackRate;
    decodedChunks += 1;
    primed = true;
    setAudioState('LIVE', 'good');
  }

  function enqueueChunk(chunk, nominalMs) {
    if (!primed) {
      primeAndScheduleChunk(chunk, nominalMs);
      return;
    }
    if (nextAudioTime < audioCtx.currentTime + 0.005) {
      underruns += 1;
      primed = false;
      nextAudioTime = 0;
      setAudioState('REBUFFER', 'warn');
      primeAndScheduleChunk(chunk, nominalMs);
      return;
    }
    currentPlaybackRate = controlledPlaybackRate(nominalMs);
    scheduleChunk(chunk, nextAudioTime, currentPlaybackRate);
    nextAudioTime += (nominalMs / 1000) / currentPlaybackRate;
    decodedChunks += 1;
  }

  function pcmFromResult(result, expectedFrames) {
    if (result?.protocol !== 1 || result?.codec !== 'ambe49'
        || Number(result?.frame_count) !== expectedFrames
        || Number(result?.sample_rate) !== SAMPLE_RATE
        || Number(result?.samples_per_frame) !== SAMPLES_PER_FRAME
        || Number(result?.channels) !== 1
        || result?.sample_format !== 's16le'
        || typeof result?.pcm_s16le_b64 !== 'string') {
      throw new Error('vocoder returned an unexpected PCM contract');
    }
    const raw = atob(result.pcm_s16le_b64);
    const expectedBytes = expectedFrames * SAMPLES_PER_FRAME * 2;
    if (raw.length !== expectedBytes || Number(result?.pcm_bytes) !== expectedBytes) {
      throw new Error(`vocoder returned ${raw.length} PCM bytes; expected ${expectedBytes}`);
    }
    const pcm = new Float32Array(expectedFrames * SAMPLES_PER_FRAME);
    for (let i = 0, sampleIndex = 0; i < raw.length; i += 2, sampleIndex += 1) {
      let sample = raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8);
      if (sample & 0x8000) sample -= 0x10000;
      pcm[sampleIndex] = Math.max(-1, Math.min(1, sample / 32768));
    }
    return pcm;
  }

  function renderStats() {
    if ($('rxAudioBuffer')) $('rxAudioBuffer').textContent = `${scheduledDepthMs()} ms`;
    if ($('rxAudioUnderruns')) $('rxAudioUnderruns').textContent = String(underruns);
    if ($('rxAudioDecoded')) $('rxAudioDecoded').textContent = String(decodedFrames);
    if ($('rxAudioErrors')) $('rxAudioErrors').textContent = String(decoderErrorFrames);
    if ($('rxAudioResets')) $('rxAudioResets').textContent = String(streamResets);
    if ($('rxAudioPoll')) $('rxAudioPoll').textContent = `${audioRunning ? AUDIO_POLL_MS : IDLE_POLL_MS} ms`;
    if ($('rxAudioRate')) $('rxAudioRate').textContent = audioCtx ? `${Math.round(audioCtx.sampleRate)} Hz` : '—';
    if ($('rxAudioChunk')) $('rxAudioChunk').textContent = `${CHUNK_MS} ms / ${CHUNK_FRAMES}f`;
    if ($('rxAudioChunks')) $('rxAudioChunks').textContent = String(decodedChunks);
    if ($('rxAudioPlayRate')) $('rxAudioPlayRate').textContent = `${currentPlaybackRate.toFixed(3)}×`;
    if ($('rxAudioHandoffs')) $('rxAudioHandoffs').textContent = String(autoHandoffs);
    if ($('rxAudioReanchors')) $('rxAudioReanchors').textContent = String(reservoirReanchors);
    if ($('rxAudioRoute')) $('rxAudioRoute').textContent = activeRoute;
  }

  async function processAudioQueue() {
    if (workerRunning || !audioRunning) return;
    workerRunning = true;
    const generation = audioGeneration;
    try {
      while (audioRunning && generation === audioGeneration) {
        if (resetRequested) {
          resetRequested = false;
          setDecoderState('RESETTING', 'active');
          try {
            await window.ywdPlugin.vocoderReset();
            if (!audioRunning || generation !== audioGeneration) return;
            setDecoderState(backendIdentity?.backend || 'EXTERNAL', 'good');
          } catch (error) {
            resetRequested = true;
            decoderErrorFrames += Math.max(1, ambeQueue.length);
            ambeQueue = [];
            setAudioState('DECODE ERROR', 'bad');
            setDecoderState('ERROR', 'bad');
            setAudioNote(`Vocoder reset failed: ${String(error?.message || error)}`);
            renderStats();
            return;
          }
          continue;
        }
        if (ambeQueue.length < CHUNK_FRAMES) return;

        const batch = ambeQueue.splice(0, CHUNK_FRAMES);
        const batchEpoch = streamEpoch;
        setDecoderState('DECODING', 'active');
        try {
          const result = await window.ywdPlugin.vocoderDecode(batch.map(item => item.bits));
          if (!audioRunning || generation !== audioGeneration) return;
          if (batchEpoch !== streamEpoch) continue;
          const pcm = pcmFromResult(result, batch.length);
          decodedFrames += batch.length;
          enqueueChunk(pcm, batch.length * FRAME_MS);
          setDecoderState(backendIdentity?.backend || 'EXTERNAL', 'good');
          setAudioNote('External vocoder live path active. AMBE49 is decoded outside the plugin and only PCM is played in the browser.');
        } catch (error) {
          if (!audioRunning || generation !== audioGeneration) return;
          decoderErrorFrames += batch.length;
          ambeQueue = [];
          streamEpoch += 1;
          resetRequested = true;
          setAudioState('DECODE ERROR', 'bad');
          setDecoderState('ERROR', 'bad');
          setAudioNote(`Live vocoder decode dropped: ${String(error?.message || error)}`);
          renderStats();
          return;
        }
        renderStats();
      }
    } finally {
      workerRunning = false;
      if (audioRunning && generation === audioGeneration && (resetRequested || ambeQueue.length >= CHUNK_FRAMES)) {
        setTimeout(() => { void processAudioQueue(); }, 0);
      }
    }
  }

  function requestStreamReset(info) {
    if (!info.reset) return;
    const safeBoundary = info.routeChanged || info.gapDetected;
    const tooDeep = primed && scheduledDepthMs() > (targetBufferMs + HARD_REANCHOR_EXTRA_MS);
    if (safeBoundary && tooDeep) {
      stopScheduledSources();
      primed = false;
      nextAudioTime = 0;
      currentPlaybackRate = 1.0;
      reservoirReanchors += 1;
    } else if (primed && nextAudioTime < audioCtx.currentTime + 0.005) {
      primed = false;
      nextAudioTime = 0;
    }
    ambeQueue = [];
    streamEpoch += 1;
    resetRequested = true;
    streamResets += 1;
  }

  function streamTransition(frame, sourceMs) {
    const key = frameKey(frame);
    const routeChanged = previousKey !== null && key !== previousKey;
    const gapDetected = lastFrameSourceMs && (sourceMs - lastFrameSourceMs) > CALL_GAP_MS;
    const burst = Number(frame.burst_seq) || 0;
    const dmrSeq = Number(frame.dmr_seq) || 0;
    let seqGap = false;
    if (!routeChanged && previousBurst !== null && burst !== previousBurst && previousDmrSeq !== null) {
      const expected = (previousDmrSeq + 1) & 0xff;
      seqGap = (dmrSeq & 0xff) !== expected;
    }
    return {reset: routeChanged || gapDetected || seqGap, key, burst, dmrSeq, routeChanged, gapDetected, seqGap};
  }

  async function startAudio() {
    const start = $('rxAudioStart');
    if (start) start.disabled = true;
    try {
      await ensureAudioContext();
      if (!window.ywdPlugin?.vocoderStatus || !window.ywdPlugin?.vocoderReset || !window.ywdPlugin?.vocoderDecode) {
        throw new Error('YWD external vocoder bridge API is unavailable');
      }
      setDecoderState('WARMING', 'active');
      const status = await window.ywdPlugin.vocoderStatus();
      if (status?.available !== true) throw new Error(String(status?.error || 'No compatible external vocoder backend is available'));
      backendIdentity = status;
      setDecoderState('RESETTING', 'active');
      await window.ywdPlugin.vocoderReset();

      audioGeneration += 1;
      audioRunning = true;
      resetRequested = false;
      resetLocalPipeline({stopSources:true, unlockAuto:true});
      setDecoderState(status.backend || 'EXTERNAL', 'good');
      setAudioState('BUFFERING');
      setAudioNote(`External backend ready: ${status.backend || 'vocoder'} · protocol ${status.protocol || 1}. Waiting for 5 recovered AMBE49 frames.`);
      if ($('rxAudioStop')) $('rxAudioStop').disabled = false;
    } catch (error) {
      audioRunning = false;
      setAudioState('ERROR', 'bad');
      setDecoderState('ERROR', 'bad');
      setAudioNote(String(error?.message || error));
    } finally {
      renderStats();
      if (start) start.disabled = false;
    }
  }

  function stopAudio() {
    audioGeneration += 1;
    audioRunning = false;
    resetRequested = false;
    resetLocalPipeline({stopSources:true, unlockAuto:true});
    setAudioState('STOPPED');
    setDecoderState('IDLE');
    setAudioNote('Audio stopped. No further vocoder requests will be sent; a socket-activated backend may exit when idle.');
    renderStats();
    if ($('rxAudioStop')) $('rxAudioStop').disabled = true;
  }

  async function acceptAmbeFrame(frame) {
    if (!audioRunning || !frameMatchesBase(frame)) return;
    try {
      const sourceMs = frameTimeMs(frame);
      if (!autoLockAccept(frame, sourceMs)) return;
      const transition = streamTransition(frame, sourceMs);
      requestStreamReset(transition);
      const bits = ambeBits(frame.ambe49);
      if (ambeQueue.length >= MAX_PENDING_FRAMES) {
        decoderErrorFrames += ambeQueue.length;
        ambeQueue = [];
        streamEpoch += 1;
        resetRequested = true;
        setAudioState('REBUFFER', 'warn');
        setAudioNote('Audio queue exceeded 300 ms; queued audio was dropped so RF can remain authoritative.');
      }
      ambeQueue.push({bits, epoch:streamEpoch});
      lastFrameSourceMs = sourceMs;
      previousKey = transition.key;
      previousBurst = transition.burst;
      previousDmrSeq = transition.dmrSeq;
      activeRoute = routeText(frame);
      if (!primed) setAudioState('BUFFERING');
      renderStats();
      void processAudioQueue();
    } catch (error) {
      decoderErrorFrames += 1;
      setAudioState('DECODE ERROR', 'bad');
      setDecoderState('ERROR', 'bad');
      setAudioNote(String(error?.message || error));
      renderStats();
    }
  }

  function installAudioPanel() {
    if ($('rxAudioPanel')) return true;
    const anchor = document.querySelector('.ambe-panel');
    if (!anchor?.parentElement) return false;
    const panel = document.createElement('section');
    panel.id = 'rxAudioPanel';
    panel.className = 'rx-audio-panel';
    panel.innerHTML = `
      <div class="rx-audio-head"><div><div class="label">PHASE 3G · EXTERNAL VOCODER LIVE AUDIO</div><div class="panel-note">Recovered AMBE49 is sent in 5-frame / 100 ms batches to a separately installed YWD Vocoder Protocol v1 backend. RX Monitor ships no AMBE decoder.</div></div><div class="rx-audio-actions"><button class="rx-btn" id="rxAudioStart">START AUDIO</button><button class="rx-btn subtle" id="rxAudioStop" disabled>STOP AUDIO</button><span class="rx-audio-state" id="rxAudioState">STOPPED</span></div></div>
      <div class="rx-audio-controls"><label>Source<select id="rxAudioSource"><option value="network">NETWORK</option><option value="rf">RF</option><option value="all">ALL</option></select></label><label>Slot<select id="rxAudioSlot"><option value="auto">AUTO</option><option value="1">TS1</option><option value="2">TS2</option></select></label><label>Jitter buffer<select id="rxAudioTarget"><option value="120">120 ms</option><option value="140">140 ms</option><option value="160" selected>160 ms</option><option value="200">200 ms</option><option value="240">240 ms</option></select></label><label class="rx-audio-volume">Volume<input id="rxAudioVolume" type="range" min="0" max="100" step="1" value="70"><span id="rxAudioVolumeValue">70%</span></label><label class="rx-audio-mute"><input id="rxAudioMute" type="checkbox"> MUTE</label></div>
      <div class="rx-audio-grid"><article><div class="label">DECODER</div><div class="rx-audio-value"><span class="rx-audio-state" id="rxDecoderState">IDLE</span></div></article><article><div class="label">BUFFER</div><div class="rx-audio-value" id="rxAudioBuffer">0 ms</div></article><article><div class="label">POLL</div><div class="rx-audio-value" id="rxAudioPoll">250 ms</div></article><article><div class="label">AUDIO RATE</div><div class="rx-audio-value" id="rxAudioRate">—</div></article><article><div class="label">CHUNK</div><div class="rx-audio-value" id="rxAudioChunk">100 ms / 5f</div></article><article><div class="label">CHUNKS</div><div class="rx-audio-value" id="rxAudioChunks">0</div></article><article><div class="label">PLAY RATE</div><div class="rx-audio-value" id="rxAudioPlayRate">1.000×</div></article><article><div class="label">HANDOFFS</div><div class="rx-audio-value" id="rxAudioHandoffs">0</div></article><article><div class="label">REANCHORS</div><div class="rx-audio-value" id="rxAudioReanchors">0</div></article><article><div class="label">UNDERRUNS</div><div class="rx-audio-value" id="rxAudioUnderruns">0</div></article><article><div class="label">DECODED</div><div class="rx-audio-value" id="rxAudioDecoded">0</div></article><article><div class="label">DECODER ERRORS</div><div class="rx-audio-value" id="rxAudioErrors">0</div></article><article><div class="label">STREAM RESETS</div><div class="rx-audio-value" id="rxAudioResets">0</div></article></div>
      <div class="rx-audio-route" id="rxAudioRoute">—</div><div class="panel-note" id="rxAudioNote">START AUDIO wakes and resets the external vocoder. Live DECODE requests remain bounded; queued audio is dropped if the decoder cannot keep up.</div>`;
    anchor.parentElement.insertBefore(panel, anchor);

    $('rxAudioStart').addEventListener('click', () => { void startAudio(); });
    $('rxAudioStop').addEventListener('click', stopAudio);
    $('rxAudioSource').addEventListener('change', event => {
      sourceFilter = String(event.target.value || 'network');
      if (audioRunning) { resetLocalPipeline({stopSources:true, unlockAuto:true}); resetRequested = true; void processAudioQueue(); }
    });
    $('rxAudioSlot').addEventListener('change', event => {
      const value = String(event.target.value || 'auto');
      slotFilter = value === '1' || value === '2' ? value : 'auto';
      if (audioRunning) { resetLocalPipeline({stopSources:true, unlockAuto:true}); resetRequested = true; void processAudioQueue(); }
    });
    $('rxAudioTarget').addEventListener('change', event => { targetBufferMs = clamp(Number(event.target.value) || DEFAULT_BUFFER_MS, 100, 300); renderStats(); });
    $('rxAudioVolume').addEventListener('input', event => { volume = clamp((Number(event.target.value) || 0) / 100, 0, 1); if ($('rxAudioVolumeValue')) $('rxAudioVolumeValue').textContent = `${Math.round(volume * 100)}%`; applyGain(); });
    $('rxAudioMute').addEventListener('change', event => { muted = !!event.target.checked; applyGain(); });

    statsTimer = setInterval(renderStats, 250);
    renderStats();
    return true;
  }

  function init() {
    if (installAudioPanel()) return;
    const root = $('ywd-plugin-root');
    if (!root) return;
    const observer = new MutationObserver(() => { if (installAudioPanel()) observer.disconnect(); });
    observer.observe(root, {childList:true, subtree:true});
    setTimeout(() => installAudioPanel(), 0);
  }

  window.ywdRxAudioFrame = frame => { void acceptAmbeFrame(frame || {}); };
  window.ywdRxPollIntervalMs = () => audioRunning ? AUDIO_POLL_MS : IDLE_POLL_MS;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();

  window.addEventListener('beforeunload', () => { if (statsTimer) clearInterval(statsTimer); audioGeneration += 1; audioRunning = false; });
})();
