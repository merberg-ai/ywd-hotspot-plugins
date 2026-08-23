'use strict';
(() => {
  const SAMPLE_RATE = 8000;
  const SAMPLES_PER_FRAME = 160;
  const CHUNK_FRAMES = 10;
  const CHUNK_MS = 200;
  const DEFAULT_BUFFER_MS = 400;
  const MAX_SCHEDULED_DEPTH_MS = 700;
  const MIN_START_LEAD_MS = 40;
  const RESERVOIR_DEADBAND_MS = 40;
  const RESERVOIR_GAIN_MS = 6000;
  const MIN_PLAYBACK_RATE = 0.99;
  const MAX_PLAYBACK_RATE = 1.01;

  let audioCtx = null;
  let gainNode = null;
  let streamHandle = null;
  let audioRunning = false;
  let primed = false;
  let nextAudioTime = 0;
  let scheduledSources = new Set();
  let targetBufferMs = DEFAULT_BUFFER_MS;
  let volume = 0.70;
  let muted = false;
  let backendName = 'EXTERNAL';
  let activeRoute = 'Waiting for streamed audio route…';
  let decodedFrames = 0;
  let decodedChunks = 0;
  let errors = 0;
  let underruns = 0;
  let streamResets = 0;
  let reservoirReanchors = 0;
  let heartbeatCount = 0;
  let heartbeatErrors = 0;
  let droppedBursts = 0;
  let droppedAmbe = 0;
  let currentPlaybackRate = 1.0;
  let decodeLastMs = 0;
  let decodeMaxMs = 0;
  let resetLastMs = 0;
  let resetMaxMs = 0;
  let statsTimer = null;

  const $ = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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

  function setNote(text) {
    const node = $('rxAudioNote');
    if (node) node.textContent = String(text || '');
  }

  async function ensureAudioContext() {
    if (!audioCtx || audioCtx.state === 'closed') {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio is not supported by this browser');
      audioCtx = new Ctor();
      gainNode = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    applyGain();
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

  function scheduledDepthMs() {
    if (!audioCtx || !primed) return 0;
    return Math.max(0, Math.round((nextAudioTime - audioCtx.currentTime) * 1000));
  }

  function controlledPlaybackRate(nominalMs) {
    if (!audioCtx || !primed) return 1.0;
    const before = Math.max(0, (nextAudioTime - audioCtx.currentTime) * 1000);
    const projected = before + nominalMs;
    const error = projected - targetBufferMs;
    if (Math.abs(error) <= RESERVOIR_DEADBAND_MS) return 1.0;
    const excess = Math.sign(error) * (Math.abs(error) - RESERVOIR_DEADBAND_MS);
    return clamp(1 + (excess / RESERVOIR_GAIN_MS), MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
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

  function primeAndSchedule(pcm, nominalMs) {
    const leadMs = Math.max(MIN_START_LEAD_MS, targetBufferMs - nominalMs);
    nextAudioTime = Math.max(audioCtx.currentTime + leadMs / 1000, nextAudioTime || 0);
    currentPlaybackRate = 1.0;
    scheduleChunk(pcm, nextAudioTime, currentPlaybackRate);
    nextAudioTime += nominalMs / 1000;
    primed = true;
    decodedChunks += 1;
    setAudioState('LIVE', 'good');
  }

  function enqueueChunk(pcm, nominalMs) {
    if (!primed) {
      primeAndSchedule(pcm, nominalMs);
      return;
    }
    const projectedDepth = Math.max(0, (nextAudioTime - audioCtx.currentTime) * 1000) + nominalMs;
    if (projectedDepth > MAX_SCHEDULED_DEPTH_MS) {
      stopScheduledSources();
      primed = false;
      nextAudioTime = 0;
      currentPlaybackRate = 1.0;
      reservoirReanchors += 1;
      primeAndSchedule(pcm, nominalMs);
      return;
    }
    if (nextAudioTime < audioCtx.currentTime + 0.005) {
      underruns += 1;
      primed = false;
      nextAudioTime = 0;
      setAudioState('REBUFFER', 'warn');
      primeAndSchedule(pcm, nominalMs);
      return;
    }
    currentPlaybackRate = controlledPlaybackRate(nominalMs);
    scheduleChunk(pcm, nextAudioTime, currentPlaybackRate);
    nextAudioTime += (nominalMs / 1000) / currentPlaybackRate;
    decodedChunks += 1;
  }

  function pcmFromEvent(event) {
    if (Number(event?.frame_count) !== CHUNK_FRAMES
        || Number(event?.sample_rate) !== SAMPLE_RATE
        || Number(event?.samples_per_frame) !== SAMPLES_PER_FRAME
        || Number(event?.channels) !== 1
        || event?.sample_format !== 's16le'
        || typeof event?.pcm_s16le_b64 !== 'string') {
      throw new Error('stream returned an unexpected PCM contract');
    }
    const raw = atob(event.pcm_s16le_b64);
    const expected = CHUNK_FRAMES * SAMPLES_PER_FRAME * 2;
    if (raw.length !== expected || Number(event.pcm_bytes) !== expected) {
      throw new Error(`stream returned ${raw.length} PCM bytes; expected ${expected}`);
    }
    const pcm = new Float32Array(CHUNK_FRAMES * SAMPLES_PER_FRAME);
    for (let i = 0, sampleIndex = 0; i < raw.length; i += 2, sampleIndex += 1) {
      let sample = raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8);
      if (sample & 0x8000) sample -= 0x10000;
      pcm[sampleIndex] = clamp(sample / 32768, -1, 1);
    }
    return pcm;
  }

  function routeText(route) {
    if (!route || typeof route !== 'object') return activeRoute;
    const path = String(route.source || '?').toUpperCase();
    const slot = Number(route.slot) || 0;
    const src = Number(route.src) || 0;
    const dst = Number(route.dst) || 0;
    return `${$('rxAudioSlot')?.value === 'auto' ? 'AUTO · ' : ''}${path} · TS${slot} · ${src} → ${route.group ? 'TG' : 'PC'} ${dst}`;
  }

  function resetLocalPlayback({stopSources = true} = {}) {
    if (stopSources) stopScheduledSources();
    primed = false;
    nextAudioTime = 0;
    currentPlaybackRate = 1.0;
  }

  function handleStreamEvent(event) {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'hello') {
      backendName = String(event.backend || 'EXTERNAL');
      resetLastMs = Number(event.initial_reset_ms) || 0;
      resetMaxMs = Math.max(resetMaxMs, resetLastMs);
      setDecoderState(backendName, 'good');
      setAudioState('BUFFERING', 'active');
      setNote('Phase 3J streamed PCM path active. DMR recovery and vocoder batching run in trusted core; the sandbox receives PCM only.');
    } else if (event.type === 'pcm') {
      try {
        const pcm = pcmFromEvent(event);
        decodeLastMs = Number(event.decode_ms) || 0;
        decodeMaxMs = Math.max(decodeMaxMs, Number(event.decode_max_ms) || decodeLastMs);
        droppedBursts = Number(event.dropped_bursts) || droppedBursts;
        droppedAmbe = Number(event.dropped_ambe) || droppedAmbe;
        activeRoute = routeText(event.route);
        decodedFrames += Number(event.frame_count) || CHUNK_FRAMES;
        enqueueChunk(pcm, CHUNK_MS);
        setDecoderState(backendName, 'good');
      } catch (error) {
        errors += 1;
        setAudioState('STREAM ERROR', 'bad');
        setNote(String(error?.message || error));
      }
    } else if (event.type === 'reset') {
      streamResets += 1;
      resetLastMs = Number(event.reset_ms) || 0;
      resetMaxMs = Math.max(resetMaxMs, resetLastMs);
      resetLocalPlayback({stopSources:true});
      setDecoderState('RESETTING', 'active');
      setAudioState('BUFFERING', 'active');
    } else if (event.type === 'drop') {
      droppedBursts = Number(event.dropped_bursts) || droppedBursts;
      droppedAmbe = Number(event.dropped_ambe) || droppedAmbe;
      resetLocalPlayback({stopSources:true});
      setAudioState('REBUFFER', 'warn');
    } else if (event.type === 'heartbeat') {
      heartbeatCount += 1;
      activeRoute = routeText(event.route);
      droppedBursts = Number(event.dropped_bursts) || droppedBursts;
      droppedAmbe = Number(event.dropped_ambe) || droppedAmbe;
      decodeMaxMs = Math.max(decodeMaxMs, Number(event.decode_max_ms) || 0);
      resetMaxMs = Math.max(resetMaxMs, Number(event.reset_max_ms) || 0);
    } else if (event.type === 'error') {
      errors += 1;
      heartbeatErrors += 1;
      resetLocalPlayback({stopSources:true});
      setAudioState(event.fatal ? 'ERROR' : 'REBUFFER', event.fatal ? 'bad' : 'warn');
      setDecoderState('ERROR', 'bad');
      setNote(String(event.error || 'RX audio stream error'));
      if (event.fatal) void stopAudio();
    } else if (event.type === 'stream-end') {
      if (audioRunning) {
        errors += 1;
        resetLocalPlayback({stopSources:true});
        setAudioState('ERROR', 'bad');
        setDecoderState('OFFLINE', 'bad');
        setNote(event.error || 'RX audio stream ended unexpectedly');
        audioRunning = false;
        streamHandle = null;
      }
    }
    renderStats();
  }

  function renderStats() {
    if ($('rxAudioBuffer')) $('rxAudioBuffer').textContent = `${scheduledDepthMs()} ms`;
    if ($('rxAudioUnderruns')) $('rxAudioUnderruns').textContent = String(underruns);
    if ($('rxDecoderState') && !$('rxDecoderState').classList.contains('active')) $('rxDecoderState').textContent = backendName;
    if ($('rxAudioDecodeRtt')) $('rxAudioDecodeRtt').textContent = decodeLastMs ? `${Math.round(decodeLastMs)} ms · max ${Math.round(decodeMaxMs)}` : '—';
    if ($('rxAudioResetRtt')) $('rxAudioResetRtt').textContent = resetLastMs ? `${Math.round(resetLastMs)} ms` : '—';
    if ($('rxAudioKeepalive')) $('rxAudioKeepalive').textContent = `${heartbeatCount} / ${heartbeatErrors} err`;
    if ($('rxAudioRoute')) $('rxAudioRoute').textContent = activeRoute;
    if ($('rxAudioPoll')) $('rxAudioPoll').textContent = 'STREAM';
    if ($('rxAudioRate')) $('rxAudioRate').textContent = audioCtx ? `${Math.round(audioCtx.sampleRate)} Hz` : '—';
    if ($('rxAudioChunk')) $('rxAudioChunk').textContent = `${CHUNK_MS} ms / ${CHUNK_FRAMES}f`;
    if ($('rxAudioChunks')) $('rxAudioChunks').textContent = String(decodedChunks);
    if ($('rxAudioPlayRate')) $('rxAudioPlayRate').textContent = `${currentPlaybackRate.toFixed(3)}×`;
    if ($('rxAudioHandoffs')) $('rxAudioHandoffs').textContent = String(droppedBursts);
    if ($('rxAudioReanchors')) $('rxAudioReanchors').textContent = String(reservoirReanchors);
    if ($('rxAudioDecoded')) $('rxAudioDecoded').textContent = String(decodedFrames);
    if ($('rxAudioErrors')) $('rxAudioErrors').textContent = String(errors);
    if ($('rxAudioResets')) $('rxAudioResets').textContent = String(streamResets);
  }

  async function startAudio() {
    if (audioRunning) return;
    const start = $('rxAudioStart');
    const stop = $('rxAudioStop');
    try {
      start.disabled = true;
      setAudioState('STARTING', 'active');
      setDecoderState('STARTING', 'active');
      await ensureAudioContext();
      resetLocalPlayback({stopSources:true});
      audioRunning = true;
      streamHandle = await window.ywdPlugin.startRxAudioStream({
        source: $('rxAudioSource')?.value || 'network',
        slot: $('rxAudioSlot')?.value || 'auto',
      }, handleStreamEvent);
      start.hidden = true;
      stop.hidden = false;
      setAudioState('BUFFERING', 'active');
    } catch (error) {
      audioRunning = false;
      streamHandle = null;
      setAudioState('ERROR', 'bad');
      setDecoderState('ERROR', 'bad');
      setNote(String(error?.message || error));
      start.hidden = false;
      stop.hidden = true;
    } finally {
      start.disabled = false;
      renderStats();
    }
  }

  async function stopAudio() {
    if (!audioRunning && !streamHandle) return;
    const handle = streamHandle;
    streamHandle = null;
    audioRunning = false;
    try { await handle?.stop?.(); } catch (_) {}
    resetLocalPlayback({stopSources:true});
    setAudioState('IDLE');
    setDecoderState('DORMANT');
    setNote('Stream stopped. The external vocoder backend may now idle-exit.');
    if ($('rxAudioStart')) $('rxAudioStart').hidden = false;
    if ($('rxAudioStop')) $('rxAudioStop').hidden = true;
    renderStats();
  }

  function installPanel() {
    if ($('rxAudioPanel')) return true;
    const anchor = document.querySelector('.ambe-panel') || document.querySelector('.frame-panel');
    if (!anchor?.parentElement) return false;
    const panel = document.createElement('section');
    panel.id = 'rxAudioPanel';
    panel.className = 'rx-audio-panel';
    panel.innerHTML = `
      <div class="rx-audio-head">
        <div><div class="label">PHASE 3J · STREAMED RX AUDIO</div><div class="panel-note">One trusted persistent PCM stream; no browser vocoder POST loop.</div></div>
        <div class="rx-audio-actions">
          <button class="rx-btn" id="rxAudioStart">START AUDIO</button>
          <button class="rx-btn" id="rxAudioStop" hidden>STOP AUDIO</button>
          <div class="rx-audio-state" id="rxAudioState">IDLE</div>
        </div>
      </div>
      <div class="rx-audio-controls">
        <label>Source<select id="rxAudioSource"><option value="network" selected>NETWORK</option><option value="rf">RF</option><option value="all">ALL</option></select></label>
        <label>Slot<select id="rxAudioSlot"><option value="auto" selected>AUTO</option><option value="1">TS1</option><option value="2">TS2</option></select></label>
        <label>Jitter buffer<select id="rxAudioTarget"><option value="200">200 ms</option><option value="240">240 ms</option><option value="320">320 ms</option><option value="400" selected>400 ms</option></select></label>
        <label class="rx-audio-volume">Volume<input id="rxAudioVolume" type="range" min="0" max="100" value="70"><span id="rxAudioVolumeValue">70%</span></label>
        <label class="rx-audio-mute">Mute<input id="rxAudioMute" type="checkbox"></label>
      </div>
      <div class="rx-audio-grid">
        <article><div class="label">DECODER</div><div class="rx-audio-value"><span class="rx-audio-state" id="rxDecoderState">DORMANT</span></div></article>
        <article><div class="label">BUFFER</div><div class="rx-audio-value" id="rxAudioBuffer">0 ms</div></article>
        <article><div class="label">UNDERRUNS</div><div class="rx-audio-value" id="rxAudioUnderruns">0</div></article>
        <article><div class="label">DECODE RTT</div><div class="rx-audio-value" id="rxAudioDecodeRtt">—</div></article>
        <article><div class="label">RESET RTT</div><div class="rx-audio-value" id="rxAudioResetRtt">—</div></article>
        <article><div class="label">KEEPALIVE</div><div class="rx-audio-value" id="rxAudioKeepalive">0 / 0 err</div></article>
        <article><div class="label">TRANSPORT</div><div class="rx-audio-value" id="rxAudioPoll">STREAM</div></article>
        <article><div class="label">OUTPUT</div><div class="rx-audio-value" id="rxAudioRate">—</div></article>
        <article><div class="label">CHUNK</div><div class="rx-audio-value" id="rxAudioChunk">200 ms / 10f</div></article>
        <article><div class="label">CHUNKS</div><div class="rx-audio-value" id="rxAudioChunks">0</div></article>
        <article><div class="label">PLAY RATE</div><div class="rx-audio-value" id="rxAudioPlayRate">1.000×</div></article>
        <article><div class="label">DROPPED BURSTS</div><div class="rx-audio-value" id="rxAudioHandoffs">0</div></article>
        <article><div class="label">REANCHORS</div><div class="rx-audio-value" id="rxAudioReanchors">0</div></article>
        <article><div class="label">DECODED</div><div class="rx-audio-value" id="rxAudioDecoded">0</div></article>
        <article><div class="label">ERRORS</div><div class="rx-audio-value" id="rxAudioErrors">0</div></article>
        <article><div class="label">RESETS</div><div class="rx-audio-value" id="rxAudioResets">0</div></article>
      </div>
      <div class="rx-audio-route" id="rxAudioRoute">Waiting for streamed audio route…</div>
      <div class="panel-note" id="rxAudioNote">START AUDIO opens one trusted PCM stream. The plugin still contains no AMBE software vocoder.</div>`;
    anchor.parentElement.insertBefore(panel, anchor);

    $('rxAudioStart').addEventListener('click', () => { void startAudio(); });
    $('rxAudioStop').addEventListener('click', () => { void stopAudio(); });
    $('rxAudioTarget').addEventListener('change', event => {
      targetBufferMs = clamp(Number(event.target.value) || DEFAULT_BUFFER_MS, 100, MAX_SCHEDULED_DEPTH_MS);
      resetLocalPlayback({stopSources:true});
      if (audioRunning) setAudioState('BUFFERING', 'active');
      renderStats();
    });
    $('rxAudioVolume').addEventListener('input', event => {
      volume = clamp(Number(event.target.value) / 100, 0, 1);
      $('rxAudioVolumeValue').textContent = `${Math.round(volume * 100)}%`;
      applyGain();
    });
    $('rxAudioMute').addEventListener('change', event => {
      muted = !!event.target.checked;
      applyGain();
    });
    for (const id of ['rxAudioSource','rxAudioSlot']) {
      $(id).addEventListener('change', () => {
        if (audioRunning) {
          void stopAudio().then(() => startAudio());
        }
      });
    }
    statsTimer = setInterval(renderStats, 250);
    window.addEventListener('beforeunload', () => { if (audioRunning) void stopAudio(); }, {once:true});
    renderStats();
    return true;
  }

  function init() {
    if (installPanel()) return;
    const root = $('ywd-plugin-root');
    if (!root) return;
    const observer = new MutationObserver(() => {
      if (installPanel()) observer.disconnect();
    });
    observer.observe(root, {childList:true, subtree:true});
    setTimeout(() => installPanel(), 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();