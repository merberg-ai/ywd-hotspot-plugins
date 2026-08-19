'use strict';
(() => {
  const SAMPLE_RATE = 8000;
  const SAMPLES_PER_FRAME = 160;
  const FRAME_MS = 20;
  let module = null;
  let captureDoc = null;
  let decoded = null;
  let audioCtx = null;
  let sourceNode = null;
  let gainNode = null;

  const $ = id => document.getElementById(id);
  const setStatus = (text, bad=false) => {
    $('status').textContent = text;
    $('status').className = bad ? 'status bad' : 'status';
  };

  function ambeBits(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!/^[0-9a-f]{13}$/.test(text)) throw new Error(`invalid AMBE49 value: ${value}`);
    const raw = BigInt(`0x${text}`);
    if ((raw & 7n) !== 0n) throw new Error(`non-zero AMBE49 padding: ${value}`);
    const bitText = raw.toString(2).padStart(52, '0').slice(0, 49);
    return Array.from(bitText, ch => ch === '1' ? 1 : 0);
  }

  function frameKey(frame) {
    return [frame.path || '', Number(frame.slot)||0, Number(frame.src)||0, Number(frame.dst)||0, frame.group ? 1 : 0].join(':');
  }

  function selectedFrames() {
    if (!captureDoc) return [];
    const path = $('pathSelect').value;
    return (captureDoc.frames || []).filter(frame => path === 'all' || String(frame.path) === path);
  }

  async function ensureModule() {
    if (module) return module;
    if (typeof window.createYwdMbeModule !== 'function') {
      throw new Error('generated/ywd-mbelib.js is missing; run BUILD-BROWSER-DECODER.sh first');
    }
    setStatus('Loading browser decoder…');
    module = await window.createYwdMbeModule();
    module._ywd_mbe_reset();
    setStatus('Browser decoder ready.');
    return module;
  }

  function decodeFrame(mod, bitsPtr, pcmPtr, bits) {
    for (let i = 0; i < 49; i++) mod.setValue(bitsPtr + i, bits[i], 'i8');
    const errs2 = Number(mod._ywd_mbe_decode()) || 0;
    const out = new Float32Array(SAMPLES_PER_FRAME);
    for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
      const sample = Number(mod.getValue(pcmPtr + (i * 2), 'i16')) || 0;
      out[i] = Math.max(-1, Math.min(1, sample / 32768));
    }
    return {pcm: out, errs2};
  }

  async function decodeCapture() {
    const frames = selectedFrames();
    if (!frames.length) throw new Error('No frames match the selected path.');
    const mod = await ensureModule();
    mod._ywd_mbe_reset();
    const bitsPtr = Number(mod._ywd_mbe_bits_ptr());
    const pcmPtr = Number(mod._ywd_mbe_pcm_ptr());
    if (!bitsPtr || !pcmPtr) throw new Error('Decoder buffer pointers are unavailable.');

    setStatus(`Decoding ${frames.length} recovered AMBE frames in browser…`);
    await new Promise(resolve => setTimeout(resolve, 0));

    const pcm = new Float32Array(frames.length * SAMPLES_PER_FRAME);
    let peak = 0;
    let sumsq = 0;
    let decoderErrors = 0;
    let resets = 0;
    let previousKey = null;
    let previousBurst = null;
    let previousDmrSeq = null;

    for (let n = 0; n < frames.length; n++) {
      const frame = frames[n];
      const key = frameKey(frame);
      const burst = Number(frame.burst_seq) || 0;
      const dmrSeq = Number(frame.dmr_seq) || 0;
      let reset = previousKey !== null && key !== previousKey;
      if (previousBurst !== null && burst !== previousBurst && previousDmrSeq !== null) {
        const expected = (previousDmrSeq + 1) & 0xff;
        if ((dmrSeq & 0xff) !== expected) reset = true;
      }
      if (reset) {
        mod._ywd_mbe_reset();
        resets += 1;
      }

      const result = decodeFrame(mod, bitsPtr, pcmPtr, ambeBits(frame.ambe49));
      if (result.errs2) decoderErrors += 1;
      const offset = n * SAMPLES_PER_FRAME;
      pcm.set(result.pcm, offset);
      for (let i = 0; i < result.pcm.length; i++) {
        const v = result.pcm[i];
        const a = Math.abs(v);
        if (a > peak) peak = a;
        sumsq += v * v;
      }

      previousKey = key;
      previousBurst = burst;
      previousDmrSeq = dmrSeq;
      if ((n % 100) === 99) await new Promise(resolve => setTimeout(resolve, 0));
    }

    const rms = Math.sqrt(sumsq / pcm.length);
    decoded = {
      pcm,
      frames: frames.length,
      seconds: pcm.length / SAMPLE_RATE,
      peak,
      rms,
      decoderErrors,
      resets,
      path: $('pathSelect').value,
    };
    renderDecoded();
    setStatus(`Decoded ${decoded.frames} frames (${decoded.seconds.toFixed(2)} s) entirely in the browser.`);
  }

  function renderDecoded() {
    if (!decoded) return;
    $('framesValue').textContent = String(decoded.frames);
    $('durationValue').textContent = `${decoded.seconds.toFixed(2)} s`;
    $('peakValue').textContent = decoded.peak.toFixed(4);
    $('rmsValue').textContent = decoded.rms.toFixed(4);
    $('resetValue').textContent = String(decoded.resets);
    $('errorValue').textContent = String(decoded.decoderErrors);
    $('playBtn').disabled = false;
    $('stopBtn').disabled = false;
  }

  async function playDecoded() {
    if (!decoded?.pcm?.length) throw new Error('Decode a capture first.');
    stopAudio();
    audioCtx = audioCtx && audioCtx.state !== 'closed' ? audioCtx : new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = Number($('volume').value) || 0.7;
    gainNode.connect(audioCtx.destination);
    const buffer = audioCtx.createBuffer(1, decoded.pcm.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(decoded.pcm);
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(gainNode);
    sourceNode.onended = () => {
      sourceNode = null;
      $('audioState').textContent = 'IDLE';
    };
    sourceNode.start();
    $('audioState').textContent = 'PLAYING';
    setStatus(`Playing ${decoded.path.toUpperCase()} browser-decoded audio via Web Audio.`);
  }

  function stopAudio() {
    if (sourceNode) {
      try { sourceNode.stop(); } catch (_) {}
      try { sourceNode.disconnect(); } catch (_) {}
    }
    sourceNode = null;
    $('audioState').textContent = 'IDLE';
  }

  async function loadCapture(file) {
    const text = await file.text();
    const doc = JSON.parse(text);
    if (doc.format !== 'ywd-dmr-rx-capture' || !Array.isArray(doc.frames) || !doc.frames.length) {
      throw new Error('Not a YWD DMR RX capture export.');
    }
    captureDoc = doc;
    decoded = null;
    stopAudio();
    const counts = {};
    for (const frame of doc.frames) counts[frame.path || 'unknown'] = (counts[frame.path || 'unknown'] || 0) + 1;
    $('captureName').textContent = file.name;
    $('captureMeta').textContent = `${doc.frames.length} AMBE frames · ${JSON.stringify(counts)} · ${(doc.frames.length * FRAME_MS / 1000).toFixed(2)} s nominal`;
    $('decodeBtn').disabled = false;
    $('playBtn').disabled = true;
    $('framesValue').textContent = '—';
    $('durationValue').textContent = '—';
    $('peakValue').textContent = '—';
    $('rmsValue').textContent = '—';
    $('resetValue').textContent = '—';
    $('errorValue').textContent = '—';
    setStatus('Capture loaded. Choose RF or NETWORK and decode.');
  }

  function bind() {
    $('captureFile').addEventListener('change', async event => {
      try {
        const file = event.target.files?.[0];
        if (file) await loadCapture(file);
      } catch (error) { setStatus(String(error?.message || error), true); }
    });
    $('decodeBtn').addEventListener('click', async () => {
      try { await decodeCapture(); }
      catch (error) { setStatus(String(error?.message || error), true); }
    });
    $('playBtn').addEventListener('click', async () => {
      try { await playDecoded(); }
      catch (error) { setStatus(String(error?.message || error), true); }
    });
    $('stopBtn').addEventListener('click', stopAudio);
    $('volume').addEventListener('input', () => {
      if (gainNode && audioCtx) gainNode.gain.setValueAtTime(Number($('volume').value) || 0, audioCtx.currentTime);
      $('volumeValue').textContent = `${Math.round((Number($('volume').value) || 0) * 100)}%`;
    });
    $('pathSelect').addEventListener('change', () => {
      decoded = null;
      $('playBtn').disabled = true;
      stopAudio();
      if (captureDoc) setStatus('Path changed. Decode again before playback.');
    });
  }

  async function init() {
    bind();
    $('volumeValue').textContent = `${Math.round((Number($('volume').value) || 0) * 100)}%`;
    try { await ensureModule(); }
    catch (error) { setStatus(String(error?.message || error), true); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
