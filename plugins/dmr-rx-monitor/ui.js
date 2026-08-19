'use strict';
(() => {
  const root = document.getElementById('ywd-plugin-root');
  let config = {max_rows:40, show_raw_hex:false, source_filter:'all'};
  let cursor = 0;
  let recent = [];
  let total = 0;
  let rfCount = 0;
  let networkCount = 0;
  let droppedCount = 0;
  let lastFrame = null;
  let pollTimer = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId = id => document.getElementById(id);

  function shell() {
    root.innerHTML = `
      <main class="rx-shell">
        <header class="rx-header">
          <div>
            <div class="eyebrow">YWD PLUGIN UI v1 · PASSIVE DMR</div>
            <h1>DMR RX Monitor</h1>
            <p>Capability-gated frame monitor. No serial, MQTT, RF ownership, or direct network access.</p>
          </div>
          <div class="bridge-pill" id="bridgePill"><span class="dot"></span><span id="bridgeText">CONNECTING</span></div>
        </header>

        <section class="hero-grid">
          <article class="hero-card active-card">
            <div class="label">LAST FRAME</div>
            <div class="big" id="lastRoute">Waiting for DMR voice…</div>
            <div class="sub" id="lastMeta">Transmit or receive a DMR call to populate this panel.</div>
          </article>
          <article class="stat-card"><div class="label">SESSION FRAMES</div><div class="stat" id="totalCount">0</div></article>
          <article class="stat-card"><div class="label">RF / NETWORK</div><div class="stat"><span id="rfCount">0</span><span class="slash">/</span><span id="networkCount">0</span></div></article>
          <article class="stat-card"><div class="label">CURSOR</div><div class="stat mono" id="cursorValue">0</div></article>
        </section>

        <div class="notice" id="notice">Unlock WebUI controls while using this experimental raw-frame monitor.</div>

        <section class="frame-panel">
          <div class="panel-head">
            <div>
              <div class="label">RECENT DMR VOICE FRAMES</div>
              <div class="panel-note" id="frameNote">No frames received yet.</div>
            </div>
            <div class="legend"><span class="tag rf">RF</span><span class="tag network">NET</span></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>PATH</th><th>SLOT</th><th>SOURCE</th><th>DEST</th><th>TYPE</th><th>SEQ/N</th><th>BER</th><th>RSSI</th><th id="hexHead">FRAME</th></tr></thead>
              <tbody id="frameRows"><tr><td colspan="10" class="empty">Waiting for passive DMR voice frames…</td></tr></tbody>
            </table>
          </div>
        </section>
      </main>`;
  }

  function setBridge(status, message = '') {
    const pill = byId('bridgePill');
    const text = byId('bridgeText');
    const normalized = String(status || 'unknown').toLowerCase();
    pill.className = `bridge-pill ${normalized === 'online' ? 'online' : normalized === 'error' ? 'error' : ''}`;
    text.textContent = normalized.toUpperCase();
    if (message) byId('notice').textContent = message;
  }

  function routeText(frame) {
    if (!frame) return 'Waiting for DMR voice…';
    const kind = frame.group ? 'TG' : 'PC';
    return `${frame.src_id}  →  ${kind} ${frame.dst_id}`;
  }

  function renderSummary() {
    byId('totalCount').textContent = String(total);
    byId('rfCount').textContent = String(rfCount);
    byId('networkCount').textContent = String(networkCount);
    byId('cursorValue').textContent = String(cursor);
    if (!lastFrame) return;
    byId('lastRoute').textContent = routeText(lastFrame);
    byId('lastMeta').textContent = `${lastFrame.source.toUpperCase()} · slot ${lastFrame.slot} · ${lastFrame.frame_kind} · seq ${lastFrame.seq_no}/${lastFrame.n}`;
  }

  function filteredRows() {
    const filter = String(config.source_filter || 'all');
    return filter === 'all' ? recent : recent.filter(frame => frame.source === filter);
  }

  function renderFrames() {
    const body = byId('frameRows');
    const rows = filteredRows().slice().reverse();
    byId('hexHead').style.display = config.show_raw_hex ? '' : 'none';
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="10" class="empty">Waiting for matching DMR voice frames…</td></tr>';
    } else {
      body.innerHTML = rows.map(frame => {
        const destination = `${frame.group ? 'TG' : 'PC'} ${frame.dst_id}`;
        const hex = config.show_raw_hex ? `<td class="hex">${esc(frame.frame_hex)}</td>` : '<td class="hex hidden"></td>';
        return `<tr>
          <td class="mono">${frame.seq}</td>
          <td><span class="tag ${frame.source === 'rf' ? 'rf' : 'network'}">${frame.source === 'rf' ? 'RF' : 'NET'}</span></td>
          <td>${frame.slot}</td>
          <td class="mono">${frame.src_id}</td>
          <td class="mono">${esc(destination)}</td>
          <td>${frame.frame_kind === 'voice_sync' ? 'SYNC' : 'VOICE'}</td>
          <td class="mono">${frame.seq_no}/${frame.n}</td>
          <td class="mono">${frame.ber}</td>
          <td class="mono">${frame.rssi}</td>
          ${hex}
        </tr>`;
      }).join('');
    }
    const suffix = droppedCount ? ` · ring overrun notices ${droppedCount}` : '';
    byId('frameNote').textContent = `${recent.length} buffered in this view · filter ${String(config.source_filter || 'all').toUpperCase()}${suffix}`;
  }

  function acceptFrames(frames) {
    for (const frame of Array.isArray(frames) ? frames : []) {
      if (!frame || !Number.isInteger(frame.seq)) continue;
      recent.push(frame);
      lastFrame = frame;
      total += 1;
      if (frame.source === 'rf') rfCount += 1;
      if (frame.source === 'network') networkCount += 1;
    }
    const maxRows = Math.max(10, Math.min(120, Number(config.max_rows) || 40));
    if (recent.length > maxRows) recent = recent.slice(-maxRows);
  }

  async function poll() {
    clearTimeout(pollTimer);
    try {
      const data = await window.ywdPlugin.readDmrVoice({after:cursor, limit:64});
      if (data && Number.isInteger(data.cursor)) cursor = Math.max(cursor, data.cursor);
      if (data?.dropped) droppedCount += 1;
      acceptFrames(data?.frames);
      const status = data?.bridge?.status || 'unknown';
      const age = data?.bridge?.heartbeat_age_s;
      setBridge(status, status === 'online'
        ? `Trusted voice bridge online${Number.isFinite(age) ? ` · heartbeat ${age.toFixed(1)}s ago` : ''}. Raw frames never leave the trusted parent except through this capability gate.`
        : `Trusted voice bridge status: ${status}.`);
      renderSummary();
      renderFrames();
      pollTimer = setTimeout(poll, 250);
    } catch (error) {
      setBridge('error', `Frame bridge error: ${String(error?.message || error)} · Make sure WebUI controls are unlocked.`);
      pollTimer = setTimeout(poll, 1000);
    }
  }

  async function init() {
    shell();
    try {
      await window.ywdPlugin.ready;
      const [state, cfg] = await Promise.all([window.ywdPlugin.getState(), window.ywdPlugin.getConfig()]);
      if (!Array.isArray(state?.capabilities) || !state.capabilities.includes('read:dmr-voice')) {
        throw new Error('read:dmr-voice capability is not active');
      }
      config = {...config, ...(cfg || {})};
      renderSummary();
      renderFrames();
      poll();
    } catch (error) {
      setBridge('error', `RX Monitor failed to initialize: ${String(error?.message || error)}`);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
