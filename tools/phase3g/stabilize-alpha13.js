'use strict';
(() => {
  // Phase 3G Alpha13 stabilization layer.
  //
  // Alpha11 proved the real recovered-AMBE49 -> external vocoder -> browser PCM
  // path. Alpha12 added timing/keepalive diagnostics but its broad MutationObserver
  // could self-trigger by rewriting the same subtree it observed. Alpha13 keeps
  // the useful stabilization behavior without observing/mutating in a feedback
  // loop.
  //
  // External RESET is much more expensive than the old in-browser decoder reset.
  // Do not turn ordinary sequence discontinuities into remote RESET traffic. True
  // call/gap boundaries are still detected independently by the Alpha11 engine
  // and continue to reset the backend.
  const originalFrameSink = window.ywdRxAudioFrame;
  if (typeof originalFrameSink === 'function') {
    window.ywdRxAudioFrame = frame => {
      const normalized = {...(frame || {}), burst_seq: 0};
      return originalFrameSink(normalized);
    };
  }

  const originalPlugin = window.ywdPlugin;
  if (!originalPlugin?.vocoderStatus || !originalPlugin?.vocoderReset || !originalPlugin?.vocoderDecode) return;

  let backendBusy = 0;
  let lastBackendActivity = performance.now();
  let decodeLastMs = 0;
  let decodeMaxMs = 0;
  let resetLastMs = 0;
  let keepaliveCount = 0;
  let keepaliveErrors = 0;
  let keepaliveTimer = null;

  const byId = id => document.getElementById(id);

  function audioRunning() {
    const stop = byId('rxAudioStop');
    return !!stop && stop.disabled === false;
  }

  function ensureStats() {
    const grid = document.querySelector('#rxAudioPanel .rx-audio-grid');
    if (!grid) return false;
    const add = (id, label, value = '—') => {
      if (byId(id)) return;
      const article = document.createElement('article');
      article.innerHTML = `<div class="label">${label}</div><div class="rx-audio-value" id="${id}">${value}</div>`;
      grid.appendChild(article);
    };
    add('rxAudioDecodeRtt', 'DECODE RTT');
    add('rxAudioResetRtt', 'RESET RTT');
    add('rxAudioKeepalive', 'KEEPALIVE', '0 / 0 err');
    if (!byId('rxAudioPhase3gAlert')) {
      const route = byId('rxAudioRoute');
      const alert = document.createElement('div');
      alert.id = 'rxAudioPhase3gAlert';
      alert.className = 'panel-note';
      alert.hidden = true;
      route?.parentElement?.insertBefore(alert, route.nextSibling);
    }
    return true;
  }

  function renderStats() {
    ensureStats();
    if (byId('rxAudioDecodeRtt')) byId('rxAudioDecodeRtt').textContent = decodeLastMs ? `${decodeLastMs.toFixed(0)} ms · max ${decodeMaxMs.toFixed(0)}` : '—';
    if (byId('rxAudioResetRtt')) byId('rxAudioResetRtt').textContent = resetLastMs ? `${resetLastMs.toFixed(0)} ms` : '—';
    if (byId('rxAudioKeepalive')) byId('rxAudioKeepalive').textContent = `${keepaliveCount} / ${keepaliveErrors} err`;

    const alert = byId('rxAudioPhase3gAlert');
    const state = String(byId('rxAudioState')?.textContent || '').trim().toUpperCase();
    const decoder = String(byId('rxDecoderState')?.textContent || '').trim().toUpperCase();
    const note = String(byId('rxAudioNote')?.textContent || '').trim();
    const bad = state.includes('ERROR') || decoder === 'ERROR';
    if (alert) {
      alert.hidden = !bad;
      alert.textContent = bad ? (note || 'External vocoder audio error') : '';
    }
  }

  async function measured(kind, fn) {
    const started = performance.now();
    backendBusy += 1;
    try {
      return await fn();
    } finally {
      const elapsed = Math.max(0, performance.now() - started);
      lastBackendActivity = performance.now();
      backendBusy = Math.max(0, backendBusy - 1);
      if (kind === 'decode') {
        decodeLastMs = elapsed;
        decodeMaxMs = Math.max(decodeMaxMs, elapsed);
      } else if (kind === 'reset') {
        resetLastMs = elapsed;
      }
      renderStats();
    }
  }

  const wrapped = Object.freeze({
    ...originalPlugin,
    vocoderStatus: () => measured('status', () => originalPlugin.vocoderStatus()),
    vocoderReset: () => measured('reset', () => originalPlugin.vocoderReset()),
    vocoderDecode: frames => measured('decode', () => originalPlugin.vocoderDecode(frames)),
  });
  window.ywdPlugin = wrapped;

  async function keepaliveTick() {
    renderStats();
    if (!audioRunning() || backendBusy > 0) return;
    if ((performance.now() - lastBackendActivity) < 2500) return;
    try {
      await wrapped.vocoderStatus();
      keepaliveCount += 1;
    } catch (_) {
      keepaliveErrors += 1;
    }
    renderStats();
  }

  function init() {
    ensureStats();
    renderStats();
    if (!keepaliveTimer) keepaliveTimer = setInterval(() => { void keepaliveTick(); }, 750);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();

  window.addEventListener('beforeunload', () => {
    if (keepaliveTimer) clearInterval(keepaliveTimer);
  });
})();
