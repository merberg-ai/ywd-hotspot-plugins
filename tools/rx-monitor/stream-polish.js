'use strict';
(() => {
  const $ = id => document.getElementById(id);

  function hideNode(node) {
    if (!node) return;
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
    node.classList.add('rx-polish-hidden');
  }

  function articleFor(id) {
    return $(id)?.closest('article') || null;
  }

  function polishAudio(panel) {
    if (panel.dataset.rxStreamPolish === '1') return;
    panel.dataset.rxStreamPolish = '1';
    const title = panel.querySelector('.rx-audio-head .label');
    if (title) title.textContent = 'DMR RX AUDIO';
    hideNode(panel.querySelector('.rx-audio-head .panel-note'));

    const route = $('rxAudioRoute');
    if (route) route.classList.add('rx-audio-route-primary');

    const grid = panel.querySelector('.rx-audio-grid');
    if (grid && !$('rxAudioAdvanced')) {
      const details = document.createElement('details');
      details.id = 'rxAudioAdvanced';
      details.className = 'rx-audio-advanced';
      const summary = document.createElement('summary');
      summary.textContent = 'ADVANCED AUDIO STATS';
      const advanced = document.createElement('div');
      advanced.className = 'rx-audio-grid rx-audio-grid-advanced';
      details.append(summary, advanced);
      for (const id of [
        'rxAudioPoll','rxAudioRate','rxAudioChunk','rxAudioChunks','rxAudioPlayRate',
        'rxAudioHandoffs','rxAudioReanchors','rxAudioDecoded','rxAudioErrors','rxAudioResets'
      ]) {
        const article = articleFor(id);
        if (article) advanced.appendChild(article);
      }
      panel.appendChild(details);
    }
  }

  function polishMonitor() {
    const header = document.querySelector('.rx-header');
    if (header) {
      const eyebrow = header.querySelector('.eyebrow');
      if (eyebrow) eyebrow.textContent = 'YWD HOTSPOT · DMR RECEIVE';
      hideNode(header.querySelector('p'));
    }
    hideNode($('notice'));
    hideNode($('cursorValue')?.closest('article'));
    hideNode($('totalCount')?.closest('article'));
    hideNode($('rfCount')?.closest('article'));
    const hero = document.querySelector('.hero-grid');
    if (hero) hero.classList.add('rx-hero-polished');
    const last = $('lastRoute')?.closest('article');
    if (last) {
      last.classList.add('rx-last-heard-card');
      const label = last.querySelector('.label');
      if (label) label.textContent = 'LAST HEARD';
    }

    const ambe = document.querySelector('.ambe-panel');
    const frames = document.querySelector('.frame-panel');
    if (ambe && frames && !$('rxMonitorDiagnostics')) {
      const ambeTitle = ambe.querySelector('.panel-head .label');
      if (ambeTitle) ambeTitle.textContent = 'CAPTURE & FEC';
      ambe.querySelectorAll('.panel-note,.ambe-note').forEach(hideNode);
      const frameTitle = frames.querySelector('.panel-head .label');
      if (frameTitle) frameTitle.textContent = 'RECENT DMR VOICE FRAMES';
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
    polishAudio(panel);
    polishMonitor();
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
    setTimeout(polish, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
