'use strict';
(() => {
  const PANEL_ID = 'vocoderDiagnostics';
  const TEST_FRAMES = 5;
  const ZERO_AMBE49 = '0'.repeat(49);
  let busy = false;

  const byId = id => document.getElementById(id);

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = String(value ?? '—');
  }

  function setState(text, tone = '') {
    const node = byId('vocoderDiagState');
    if (!node) return;
    node.textContent = String(text || 'IDLE').toUpperCase();
    node.className = `ambe-state${tone ? ` ${tone}` : ''}`;
  }

  function setNote(text) {
    setText('vocoderDiagNote', text || '');
  }

  function setDetails(value) {
    const node = byId('vocoderDiagDetails');
    if (!node) return;
    if (!value) {
      node.hidden = true;
      node.textContent = '';
      return;
    }
    node.hidden = false;
    node.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  function setBusy(value) {
    busy = !!value;
    for (const id of ['vocoderStatusBtn', 'vocoderResetBtn', 'vocoderDecodeBtn']) {
      const node = byId(id);
      if (node) node.disabled = busy;
    }
  }

  function elapsedText(started) {
    return `${Math.max(0, performance.now() - started).toFixed(0)} ms`;
  }

  function renderStatus(result, elapsed) {
    const available = result?.available === true;
    setState(available ? 'READY' : 'UNAVAILABLE', available ? 'good' : 'warn');
    setText('vocoderDiagBackend', available ? (result.backend || 'available') : 'unavailable');
    setText('vocoderDiagProtocol', result?.protocol ?? '—');
    setText('vocoderDiagMode', available ? `${result.fake ? 'FAKE · ' : ''}${result.mode || 'backend'}` : '—');
    setText('vocoderDiagBatch', available ? `${result.preferred_batch_frames || '—'} preferred / ${result.max_batch_frames || '—'} max` : '—');
    setText('vocoderDiagAudio', available ? `${result.sample_rate || '—'} Hz · ${result.samples_per_frame || '—'} spf · ${result.sample_format || '—'}` : '—');
    setText('vocoderDiagLatency', elapsed);
    setText('vocoderDiagTest', '—');
    setText('vocoderDiagPcm', '—');
    setNote(available
      ? 'Backend answered STATUS through the sandboxed plugin → trusted dashboard → local YWD Vocoder Protocol v1 path.'
      : String(result?.error || 'No compatible vocoder backend is available.'));
    setDetails(result);
  }

  async function runStatus() {
    if (busy) return;
    const started = performance.now();
    setBusy(true);
    setState('PROBING', 'active');
    setNote('STATUS may take several seconds when a Pi Zero is cold-starting a socket-activated backend.');
    setDetails(null);
    try {
      if (!window.ywdPlugin?.vocoderStatus) throw new Error('YWD vocoder bridge API is unavailable');
      renderStatus(await window.ywdPlugin.vocoderStatus(), elapsedText(started));
    } catch (error) {
      setState('ERROR', 'error');
      setText('vocoderDiagLatency', elapsedText(started));
      setNote(String(error?.message || error));
      setDetails({error:String(error?.message || error)});
    } finally {
      setBusy(false);
    }
  }

  async function runReset() {
    if (busy) return;
    const started = performance.now();
    setBusy(true);
    setState('RESETTING', 'active');
    setNote('Requesting a backend stream-state reset.');
    setDetails(null);
    try {
      if (!window.ywdPlugin?.vocoderReset) throw new Error('YWD vocoder bridge API is unavailable');
      const result = await window.ywdPlugin.vocoderReset();
      setState(result?.ok === true ? 'RESET OK' : 'RESET ?', result?.ok === true ? 'good' : 'warn');
      setText('vocoderDiagProtocol', result?.protocol ?? '—');
      setText('vocoderDiagLatency', elapsedText(started));
      setNote(result?.ok === true ? 'Backend reset completed through the trusted bridge.' : 'Backend returned an unexpected reset result.');
      setDetails(result);
    } catch (error) {
      setState('ERROR', 'error');
      setText('vocoderDiagLatency', elapsedText(started));
      setNote(String(error?.message || error));
      setDetails({error:String(error?.message || error)});
    } finally {
      setBusy(false);
    }
  }

  function decodePass(result) {
    return result?.protocol === 1
      && result?.codec === 'ambe49'
      && result?.frame_count === TEST_FRAMES
      && result?.sample_rate === 8000
      && result?.samples_per_frame === 160
      && result?.channels === 1
      && result?.sample_format === 's16le'
      && result?.pcm_bytes === 1600
      && typeof result?.pcm_s16le_b64 === 'string'
      && result.pcm_s16le_b64.length > 0;
  }

  async function runDecodeTest() {
    if (busy) return;
    const started = performance.now();
    setBusy(true);
    setState('DECODING', 'active');
    setNote(`Sending ${TEST_FRAMES} fixed zero AMBE49 frames. This tests the bridge and PCM return shape; it is not a speech-quality test.`);
    setDetails(null);
    try {
      if (!window.ywdPlugin?.vocoderDecode) throw new Error('YWD vocoder bridge API is unavailable');
      const result = await window.ywdPlugin.vocoderDecode(Array.from({length:TEST_FRAMES}, () => ZERO_AMBE49));
      const pass = decodePass(result);
      setState(pass ? 'TEST PASS' : 'TEST FAIL', pass ? 'good' : 'error');
      setText('vocoderDiagBackend', result?.codec || '—');
      setText('vocoderDiagProtocol', result?.protocol ?? '—');
      setText('vocoderDiagAudio', `${result?.sample_rate || '—'} Hz · ${result?.samples_per_frame || '—'} spf · ${result?.sample_format || '—'}`);
      setText('vocoderDiagLatency', elapsedText(started));
      setText('vocoderDiagTest', `${result?.frame_count ?? '—'} frames`);
      setText('vocoderDiagPcm', `${result?.pcm_bytes ?? '—'} bytes${result?.pcm_sha256 ? ` · ${String(result.pcm_sha256).slice(0, 12)}…` : ''}`);
      setNote(pass
        ? 'PASS: sandboxed RX Monitor received the expected 5-frame / 100 ms PCM result through YWD Vocoder Protocol v1.'
        : 'FAIL: the backend answered, but the PCM response shape did not match the protocol contract.');
      setDetails(result);
    } catch (error) {
      setState('ERROR', 'error');
      setText('vocoderDiagLatency', elapsedText(started));
      setText('vocoderDiagTest', 'failed');
      setNote(String(error?.message || error));
      setDetails({error:String(error?.message || error)});
    } finally {
      setBusy(false);
    }
  }

  function installPanel() {
    if (byId(PANEL_ID)) return true;
    const shell = document.querySelector('.rx-shell');
    if (!shell) return false;

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'vocoder-panel';
    panel.innerHTML = `
      <div class="panel-head">
        <div>
          <div class="label">YWD VOCODER PROTOCOL v1 · EXTERNAL BACKEND</div>
          <div class="panel-note">Diagnostic bridge proof only. RX Monitor contains no AMBE software vocoder and sends no request until you click a button.</div>
        </div>
        <div class="phase-actions">
          <button class="rx-btn subtle" id="vocoderStatusBtn">STATUS</button>
          <button class="rx-btn subtle" id="vocoderResetBtn">RESET</button>
          <button class="rx-btn" id="vocoderDecodeBtn">5-FRAME TEST</button>
          <div class="ambe-state" id="vocoderDiagState">IDLE</div>
        </div>
      </div>
      <div class="vocoder-diag-grid">
        <article><div class="label">BACKEND</div><div class="ambe-value" id="vocoderDiagBackend">—</div></article>
        <article><div class="label">PROTOCOL</div><div class="ambe-value" id="vocoderDiagProtocol">—</div></article>
        <article><div class="label">MODE</div><div class="ambe-value" id="vocoderDiagMode">—</div></article>
        <article><div class="label">BATCH</div><div class="ambe-value" id="vocoderDiagBatch">—</div></article>
        <article><div class="label">PCM SHAPE</div><div class="ambe-value small" id="vocoderDiagAudio">—</div></article>
        <article><div class="label">LAST TEST</div><div class="ambe-value" id="vocoderDiagTest">—</div></article>
        <article><div class="label">PCM RESULT</div><div class="ambe-value small mono" id="vocoderDiagPcm">—</div></article>
        <article><div class="label">ROUND TRIP</div><div class="ambe-value" id="vocoderDiagLatency">—</div></article>
      </div>
      <div class="ambe-note" id="vocoderDiagNote">Idle. Opening this panel does not start or probe a vocoder backend.</div>
      <pre class="ambe-hex vocoder-diag-details" id="vocoderDiagDetails" hidden></pre>`;

    const framePanel = document.querySelector('.frame-panel');
    if (framePanel?.parentElement === shell) shell.insertBefore(panel, framePanel);
    else shell.appendChild(panel);

    byId('vocoderStatusBtn')?.addEventListener('click', runStatus);
    byId('vocoderResetBtn')?.addEventListener('click', runReset);
    byId('vocoderDecodeBtn')?.addEventListener('click', runDecodeTest);
    return true;
  }

  function init(attempt = 0) {
    if (installPanel()) return;
    if (attempt < 20) setTimeout(() => init(attempt + 1), 25);
  }

  setTimeout(() => init(), 0);
})();
