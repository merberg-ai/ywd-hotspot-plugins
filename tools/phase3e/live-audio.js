'use strict';
(() => {
  const SAMPLE_RATE = 8000;
  const SAMPLES_PER_FRAME = 160;
  const FRAME_MS = 20;
  const DEFAULT_BUFFER_MS = 160;
  const CALL_GAP_MS = 500;
  const AUTO_LOCK_GAP_MS = 900;
  const AUDIO_POLL_MS = 100;
  const IDLE_POLL_MS = 250;

  let mbe = null;
  let bitsPtr = 0;
  let pcmPtr = 0;
  let audioCtx = null;
  let gainNode = null;
  let audioRunning = false;
  let primed = false;
  let nextAudioTime = 0;
  let pendingPcm = [];
  let scheduledSources = new Set();
  let sourceFilter = 'network';
  let slotFilter = 'auto';
  let targetBufferMs = DEFAULT_BUFFER_MS;
  let volume = 0.70;
  let muted = false;
  let decodedFrames = 0;
  let decoderErrorFrames = 0;
  let underruns = 0;
  let streamResets = 0;
  let lastFrameAt = 0;
  let previousKey = null;
  let previousBurst = null;
  let previousDmrSeq = null;
  let autoLockKey = null;
  let autoLockLastFrameAt = 0;
  let activeRoute = '—';
  let statsTimer = null;

  const $ = id => document.getElementById(id);

  function ambeBits(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!/^[0-9a-f]{13}$/.test(text)) throw new Error(`invalid AMBE49 value: ${value}`);
    const raw = BigInt(`0x${text}`);
    if ((raw & 7n) !== 0n) throw new Error(`non-zero AMBE49 padding: ${value}`);
    const bitText = raw.toString(2).padStart(52, '0').slice(0, 49);
    return Array.from(bitText, ch => ch === '1' ? 1 : 0);
  }

  function frameKey(frame) {
    return [frame.path || '', Number(frame.slot) || 0, Number(frame.src) || 0, Number(frame.dst) || 0, frame.group ? 1 : 0].join(':');
  }

  function frameMatchesBase(frame) {
    if (sourceFilter !== 'all' && String(frame.path) !== sourceFilter) return false;
    if (slotFilter !== 'auto' && Number(frame.slot) !== Number(slotFilter)) return false;
    return true;
  }

  function autoLockAccept(frame, nowMs) {
    if (slotFilter !== 'auto') return true;
    const key = frameKey(frame);
    if (autoLockKey === null) {
      autoLockKey = key;
      autoLockLastFrameAt = nowMs;
      return true;
    }
    if (key === autoLockKey) {
      autoLockLastFrameAt = nowMs;
      return true;
    }
    if (autoLockLastFrameAt && (nowMs - autoLockLastFrameAt) >= AUTO_LOCK_GAP_MS) {
      autoLockKey = key;
      autoLockLastFrameAt = nowMs;
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

  async function ensureDecoder() {
    if (mbe) return mbe;
    const factory = window.createYwdMbeModule || (typeof createYwdMbeModule === 'function' ? createYwdMbeModule : null);
    if (typeof factory !== 'function') throw new Error('browser AMBE decoder bundle is unavailable');
    setDecoderState('LOADING');
    mbe = await factory();
    mbe._ywd_mbe_reset();
    bitsPtr = Number(mbe._ywd_mbe_bits_ptr());
    pcmPtr = Number(mbe._ywd_mbe_pcm_ptr());
    if (!bitsPtr || !pcmPtr) throw new Error('decoder buffer pointers are unavailable');
    setDecoderState('READY', 'good');
    return mbe;
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

  function resetPipeline({decoder = true, stopSources = false, unlockAuto = true} = {}) {
    if (stopSources) stopScheduledSources();
    pendingPcm = [];
    primed = false;
    nextAudioTime = 0;
    previousKey = null;
    previousBurst = null;
    previousDmrSeq = null;
    lastFrameAt = 0;
    activeRoute = '—';
    if (unlockAuto) {
      autoLockKey = null;
      autoLockLastFrameAt = 0;
    }
    if (decoder && mbe) mbe._ywd_mbe_reset();
    renderStats();
  }

  function decodeFrame(frame) {
    const bits = ambeBits(frame.ambe49);
    for (let i = 0; i < 49; i++) mbe.setValue(bitsPtr + i, bits[i], 'i8');
    const errs2 = Number(mbe._ywd_mbe_decode()) || 0;
    const pcm = new Float32Array(SAMPLES_PER_FRAME);
    for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
      const sample = Number(mbe.getValue(pcmPtr + (i * 2), 'i16')) || 0;
      pcm[i] = Math.max(-1, Math.min(1, sample / 32768));
    }
    decodedFrames += 1;
    if (errs2) decoderErrorFrames += 1;
    return pcm;
  }

  function schedulePcm(pcm, when) {
    const buffer = audioCtx.createBuffer(1, pcm.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(pcm);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    scheduledSources.add(source);
    source.onended = () => {
      scheduledSources.delete(source);
      try { source.disconnect(); } catch (_) {}
    };
    source.start(when);
  }

  function primeAudio() {
    const targetFrames = Math.max(6, Math.ceil(targetBufferMs / FRAME_MS));
    if (pendingPcm.length < targetFrames) {
      setAudioState('BUFFERING');
      return;
    }
    nextAudioTime = Math.max(audioCtx.currentTime + 0.04, nextAudioTime || 0);
    for (const pcm of pendingPcm) {
      schedulePcm(pcm, nextAudioTime);
      nextAudioTime += FRAME_MS / 1000;
    }
    pendingPcm = [];
    primed = true;
    setAudioState('LIVE', 'good');
  }

  function enqueuePcm(pcm) {
    if (!primed) {
      pendingPcm.push(pcm);
      primeAudio();
      return;
    }
    if (nextAudioTime < audioCtx.currentTime + 0.005) {
      underruns += 1;
      pendingPcm = [pcm];
      primed = false;
      nextAudioTime = 0;
      setAudioState('REBUFFER', 'warn');
      return;
    }
    schedulePcm(pcm, nextAudioTime);
    nextAudioTime += FRAME_MS / 1000;
  }

  function bufferDepthMs() {
    if (!audioCtx) return pendingPcm.length * FRAME_MS;
    if (!primed) return pendingPcm.length * FRAME_MS;
    return Math.max(0, Math.round((nextAudioTime - audioCtx.currentTime) * 1000));
  }

  function currentPollMs() {
    return audioRunning ? AUDIO_POLL_MS : IDLE_POLL_MS;
  }

  function renderStats() {
    if ($('rxAudioBuffer')) $('rxAudioBuffer').textContent = `${bufferDepthMs()} ms`;
    if ($('rxAudioUnderruns')) $('rxAudioUnderruns').textContent = String(underruns);
    if ($('rxAudioDecoded')) $('rxAudioDecoded').textContent = String(decodedFrames);
    if ($('rxAudioErrors')) $('rxAudioErrors').textContent = String(decoderErrorFrames);
    if ($('rxAudioResets')) $('rxAudioResets').textContent = String(streamResets);
    if ($('rxAudioPoll')) $('rxAudioPoll').textContent = `${currentPollMs()} ms`;
    if ($('rxAudioRoute')) $('rxAudioRoute').textContent = activeRoute;
  }

  async function startAudio() {
    const start = $('rxAudioStart');
    if (start) start.disabled = true;
    try {
      await ensureDecoder();
      await ensureAudioContext();
      audioRunning = true;
      resetPipeline({decoder:true, stopSources:true, unlockAuto:true});
      setAudioState('BUFFERING');
      if ($('rxAudioStop')) $('rxAudioStop').disabled = false;
    } catch (error) {
      audioRunning = false;
      setAudioState('ERROR', 'bad');
      setDecoderState('ERROR', 'bad');
      const note = $('rxAudioNote');
      if (note) note.textContent = String(error?.message || error);
    } finally {
      renderStats();
      if (start) start.disabled = false;
    }
  }

  function stopAudio() {
    audioRunning = false;
    resetPipeline({decoder:true, stopSources:true, unlockAuto:true});
    setAudioState('STOPPED');
    renderStats();
    if ($('rxAudioStop')) $('rxAudioStop').disabled = true;
  }

  function streamNeedsReset(frame, nowMs) {
    const key = frameKey(frame);
    let reset = false;
    if (lastFrameAt && (nowMs - lastFrameAt) > CALL_GAP_MS) reset = true;
    if (previousKey !== null && key !== previousKey) reset = true;
    const burst = Number(frame.burst_seq) || 0;
    const dmrSeq = Number(frame.dmr_seq) || 0;
    if (previousBurst !== null && burst !== previousBurst && previousDmrSeq !== null) {
      const expected = (previousDmrSeq + 1) & 0xff;
      if ((dmrSeq & 0xff) !== expected) reset = true;
    }
    return {reset, key, burst, dmrSeq};
  }

  async function acceptAmbeFrame(frame) {
    if (!audioRunning || !frameMatchesBase(frame)) return;
    try {
      if (!mbe || !audioCtx) return;
      const nowMs = performance.now();
      if (!autoLockAccept(frame, nowMs)) return;
      const seq = streamNeedsReset(frame, nowMs);
      if (seq.reset) {
        mbe._ywd_mbe_reset();
        pendingPcm = [];
        primed = false;
        nextAudioTime = 0;
        streamResets += 1;
      }
      const pcm = decodeFrame(frame);
      enqueuePcm(pcm);
      lastFrameAt = nowMs;
      previousKey = seq.key;
      previousBurst = seq.burst;
      previousDmrSeq = seq.dmrSeq;
      if (slotFilter === 'auto') autoLockLastFrameAt = nowMs;
      activeRoute = routeText(frame);
      renderStats();
    } catch (error) {
      decoderErrorFrames += 1;
      setAudioState('DECODE ERROR', 'bad');
      const note = $('rxAudioNote');
      if (note) note.textContent = String(error?.message || error);
    }
  }

  // The Phase 3E build helper patches the proven Phase 3B recovery path to call
  // this hook for each corrected 49-bit AMBE frame. The hook never receives raw
  // modem ownership or network access; it consumes only browser-memory data.
  window.ywdRxAudioFrame = frame => { void acceptAmbeFrame(frame || {}); };

  // The normal monitor remains at its proven 250 ms cadence while audio is
  // stopped. START AUDIO asks the host polling loop for a 100 ms cadence.
  window.ywdRxPollIntervalMs = () => currentPollMs();

  function mountAudioUi() {
    if ($('rxAudioPanel')) return true;
    const anchor = document.querySelector('.ambe-panel');
    if (!anchor?.parentElement) return false;
    const panel = document.createElement('section');
    panel.id = 'rxAudioPanel';
    panel.className = 'rx-audio-panel';
    panel.innerHTML = `
      <div class="rx-audio-head">
        <div>
          <div class="label">PHASE 3E · LIVE BROWSER AUDIO</div>
          <div class="panel-note">AMBE+2 decode and PCM playback run on this browser. START AUDIO is always explicit.</div>
        </div>
        <div class="rx-audio-actions">
          <button class="rx-btn" id="rxAudioStart">START AUDIO</button>
          <button class="rx-btn subtle" id="rxAudioStop" disabled>STOP AUDIO</button>
          <span class="rx-audio-state" id="rxAudioState">STOPPED</span>
        </div>
      </div>
      <div class="rx-audio-controls">
        <label>Source<select id="rxAudioSource"><option value="network">NETWORK</option><option value="rf">RF</option><option value="all">ALL</option></select></label>
        <label>Slot<select id="rxAudioSlot"><option value="auto">AUTO</option><option value="1">TS1</option><option value="2">TS2</option></select></label>
        <label>Jitter buffer<select id="rxAudioTarget"><option value="120">120 ms</option><option value="140">140 ms</option><option value="160" selected>160 ms</option><option value="200">200 ms</option><option value="240">240 ms</option></select></label>
        <label class="rx-audio-volume">Volume<input id="rxAudioVolume" type="range" min="0" max="100" step="1" value="70"><span id="rxAudioVolumeValue">70%</span></label>
        <label class="rx-audio-mute"><input id="rxAudioMute" type="checkbox"> MUTE</label>
      </div>
      <div class="rx-audio-grid">
        <article><div class="label">DECODER</div><div class="rx-audio-value"><span class="rx-audio-state" id="rxDecoderState">IDLE</span></div></article>
        <article><div class="label">BUFFER</div><div class="rx-audio-value" id="rxAudioBuffer">0 ms</div></article>
        <article><div class="label">POLL</div><div class="rx-audio-value" id="rxAudioPoll">250 ms</div></article>
        <article><div class="label">UNDERRUNS</div><div class="rx-audio-value" id="rxAudioUnderruns">0</div></article>
        <article><div class="label">DECODED</div><div class="rx-audio-value" id="rxAudioDecoded">0</div></article>
        <article><div class="label">DECODER ERRORS</div><div class="rx-audio-value" id="rxAudioErrors">0</div></article>
        <article><div class="label">STREAM RESETS</div><div class="rx-audio-value" id="rxAudioResets">0</div></article>
      </div>
      <div class="rx-audio-route" id="rxAudioRoute">—</div>
      <div class="panel-note" id="rxAudioNote">AUTO locks playback to one active call/route so simultaneous TS1/TS2 traffic cannot thrash the decoder. Idle polling is 250 ms; START AUDIO uses 100 ms.</div>`;
    anchor.parentElement.insertBefore(panel, anchor);

    $('rxAudioStart').addEventListener('click', () => { void startAudio(); });
    $('rxAudioStop').addEventListener('click', stopAudio);
    $('rxAudioSource').addEventListener('change', event => {
      sourceFilter = String(event.target.value || 'network');
      if (audioRunning) resetPipeline({decoder:true, stopSources:true, unlockAuto:true});
    });
    $('rxAudioSlot').addEventListener('change', event => {
      const value = String(event.target.value || 'auto');
      slotFilter = value === '1' || value === '2' ? value : 'auto';
      if (audioRunning) resetPipeline({decoder:true, stopSources:true, unlockAuto:true});
    });
    $('rxAudioTarget').addEventListener('change', event => {
      targetBufferMs = Math.max(120, Math.min(240, Number(event.target.value) || DEFAULT_BUFFER_MS));
      if (audioRunning) resetPipeline({decoder:true, stopSources:true, unlockAuto:true});
    });
    $('rxAudioVolume').addEventListener('input', event => {
      volume = Math.max(0, Math.min(1, (Number(event.target.value) || 0) / 100));
      $('rxAudioVolumeValue').textContent = `${Math.round(volume * 100)}%`;
      applyGain();
    });
    $('rxAudioMute').addEventListener('change', event => {
      muted = !!event.target.checked;
      applyGain();
    });

    if (!statsTimer) statsTimer = setInterval(renderStats, 250);
    renderStats();
    return true;
  }

  function init() {
    const tryMount = () => {
      if (mountAudioUi()) return;
      const root = document.getElementById('ywd-plugin-root');
      if (!root) return;
      const observer = new MutationObserver(() => {
        if (mountAudioUi()) observer.disconnect();
      });
      observer.observe(root, {childList:true, subtree:true});
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(tryMount, 0), {once:true});
    else setTimeout(tryMount, 0);
    window.addEventListener('pagehide', stopAudio, {once:true});
  }

  init();
})();
