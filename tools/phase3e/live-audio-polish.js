'use strict';
(() => {
  const $ = id => document.getElementById(id);

  // Presentation polish must never remove nodes owned by the proven alpha5
  // player or the underlying RX Monitor UI. Several of those nodes are updated
  // continuously without null checks. Hide them instead so the runtime DOM
  // contract remains intact while the normal operator view stays clean.
  function hideNode(node) {
    if (!node) return;
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
    node.classList.add('rx-polish-hidden');
  }

  function articleFor(id) {
    return $(id)?.closest('article') || null;
  }

  function installAudioToggle(panel) {
    const start = $('rxAudioStart');
    const stop = $('rxAudioStop');
    const state = $('rxAudioState');
    if (!start || !stop || !state || start.dataset.rxPolished === '1') return;
    start.dataset.rxPolished = '1';
    const stopControl = stop;
    hideNode(stopControl);
    start.classList.add('rx-audio-toggle');

    let starting = false;
    let stopping = false;

    function runningState() {
      return ['LIVE', 'BUFFERING', 'REBUFFER', 'DECODE ERROR'].includes(String(state.textContent || '').trim().toUpperCase());
    }

    function sync() {
      const running = runningState();
      if (running) {
        starting = false;
        stopping = false;
        start.disabled = false;
        start.textContent = 'STOP AUDIO';
        start.setAttribute('aria-pressed', 'true');
        start.classList.add('active');
        start.classList.remove('working');
        start.removeAttribute('aria-busy');
        return;
      }
      if (!starting && !stopping) {
        start.disabled = false;
        start.textContent = 'START AUDIO';
        start.setAttribute('aria-pressed', 'false');
        start.classList.remove('active', 'working');
        start.removeAttribute('aria-busy');
      }
      if (String(state.textContent || '').trim().toUpperCase() === 'ERROR') {
        starting = false;
        stopping = false;
      }
    }

    start.addEventListener('click', event => {
      if (runningState() || start.getAttribute('aria-pressed') === 'true') {
        event.preventDefault();
        event.stopImmediatePropagation();
        stopping = true;
        start.disabled = true;
        start.classList.add('working');
        start.setAttribute('aria-busy', 'true');
        start.textContent = 'STOPPING…';
        try { stopControl.click(); } finally {
          setTimeout(() => { stopping = false; sync(); }, 30);
        }
        return;
      }
      starting = true;
      start.classList.add('working');
      start.setAttribute('aria-busy', 'true');
      start.textContent = 'STARTING…';
      // Allow alpha5's proven START AUDIO listener to run normally.
      setTimeout(sync, 80);
      setTimeout(sync, 350);
    }, true);

    new MutationObserver(sync).observe(state, {childList:true, characterData:true, subtree:true, attributes:true});
    sync();
  }

  function cleanAudioPanel(panel) {
    const title = panel.querySelector('.rx-audio-head .label');
    if (title) title.textContent = 'DMR RX AUDIO';
    hideNode(panel.querySelector('.rx-audio-head .panel-note'));
    hideNode($('rxAudioNote'));

    const grid = panel.querySelector('.rx-audio-grid');
    if (grid && !$('rxAudioAdvanced')) {
      const details = document.createElement('details');
      details.id = 'rxAudioAdvanced';
      details.className = 'rx-audio-advanced';
      const summary = document.createElement('summary');
      summary.textContent = 'ADVANCED AUDIO STATS';
      const advancedGrid = document.createElement('div');
      advancedGrid.className = 'rx-audio-grid rx-audio-grid-advanced';
      details.append(summary, advancedGrid);

      const advancedIds = [
        'rxAudioPoll', 'rxAudioRate', 'rxAudioChunk', 'rxAudioChunks',
        'rxAudioPlayRate', 'rxAudioHandoffs', 'rxAudioReanchors',
        'rxAudioDecoded', 'rxAudioErrors', 'rxAudioResets'
      ];
      for (const id of advancedIds) {
        const article = articleFor(id);
        if (article) advancedGrid.appendChild(article);
      }
      panel.appendChild(details);
    }

    installAudioToggle(panel);
  }

  function cleanMonitorShell() {
    const header = document.querySelector('.rx-header');
    if (header) {
      const eyebrow = header.querySelector('.eyebrow');
      if (eyebrow) eyebrow.textContent = 'YWD HOTSPOT · DMR RECEIVE';
      hideNode(header.querySelector('p'));
    }

    // The base monitor writes status/capture messages to #notice, so keep the
    // node alive even though production polish does not show it by default.
    hideNode($('notice'));

    const cursorCard = $('cursorValue')?.closest('article');
    if (cursorCard) hideNode(cursorCard);

    const ambe = document.querySelector('.ambe-panel');
    const frames = document.querySelector('.frame-panel');
    if (ambe && frames && !$('rxMonitorDiagnostics')) {
      const ambeTitle = ambe.querySelector('.panel-head .label');
      if (ambeTitle) ambeTitle.textContent = 'CAPTURE & FEC';
      // #ambeNote is continuously updated by renderAmbe(). Hide, never remove.
      ambe.querySelectorAll('.panel-note,.ambe-note').forEach(hideNode);
      const frameTitle = frames.querySelector('.panel-head .label');
      if (frameTitle) frameTitle.textContent = 'RECENT DMR VOICE FRAMES';
      // #frameNote is continuously updated by renderFrames(). Hide, never remove.
      frames.querySelectorAll('.panel-note').forEach(hideNode);

      const details = document.createElement('details');
      details.id = 'rxMonitorDiagnostics';
      details.className = 'rx-monitor-diagnostics';
      const summary = document.createElement('summary');
      summary.textContent = 'CAPTURE & FRAME DIAGNOSTICS';
      ambe.parentElement.insertBefore(details, ambe);
      details.append(summary, ambe, frames);
    }
  }

  function polish() {
    const panel = $('rxAudioPanel');
    if (!panel) return false;
    if (panel.dataset.rxProductionPolish === '1') return true;
    panel.dataset.rxProductionPolish = '1';
    cleanAudioPanel(panel);
    cleanMonitorShell();
    return true;
  }

  function init() {
    if (polish()) return;
    const root = $('ywd-plugin-root');
    if (!root) return;
    const observer = new MutationObserver(() => {
      if (polish()) observer.disconnect();
    });
    observer.observe(root, {childList:true, subtree:true});
    setTimeout(() => polish(), 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
