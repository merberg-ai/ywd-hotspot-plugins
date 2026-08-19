'use strict';
(() => {
  const root = document.getElementById('ywd-plugin-root');
  let config = {max_rows:40, show_raw_hex:false, show_ambe_hex:false, source_filter:'all'};
  let cursor = 0;
  let recent = [];
  let total = 0;
  let rfCount = 0;
  let networkCount = 0;
  let droppedCount = 0;
  let lastFrame = null;
  let pollTimer = null;

  // MMDVM-Host AMBEFEC.cpp at the pinned YWD upstream commit uses these exact
  // bit maps to reconstruct each 72-bit DMR AMBE+2 channel/FEC block.
  const DMR_A_TABLE = [0,4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64,68,1,5,9,13,17,21];
  const DMR_B_TABLE = [25,29,33,37,41,45,49,53,57,61,65,69,2,6,10,14,18,22,26,30,34,38,42];
  const DMR_C_TABLE = [46,50,54,58,62,66,70,3,7,11,15,19,23,27,31,35,39,43,47,51,55,59,63,67,71];
  let ambeBlockCount = 0;
  let extractionErrors = 0;
  let lastAmbeBlocks = [];
  let cadenceSamples = [];
  let lastBurstAt = null;
  let lastBurstKey = '';

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

        <section class="ambe-panel">
          <div class="panel-head">
            <div>
              <div class="label">PHASE 3A · AMBE+2 CHANNEL EXTRACTION</div>
              <div class="panel-note">Browser-side diagnostics only — no vocoder/audio decoding yet.</div>
            </div>
            <div class="ambe-state waiting" id="ambeState">WAITING</div>
          </div>
          <div class="ambe-grid">
            <article><div class="label">CODED BLOCKS</div><div class="ambe-value" id="ambeCount">0</div></article>
            <article><div class="label">LAST BURST</div><div class="ambe-value" id="ambeBurst">—</div></article>
            <article><div class="label">BURST CADENCE</div><div class="ambe-value" id="ambeCadence">—</div></article>
            <article><div class="label">BLOCK RATE</div><div class="ambe-value" id="ambeRate">—</div></article>
            <article><div class="label">EXTRACT ERRORS</div><div class="ambe-value" id="ambeErrors">0</div></article>
          </div>
          <div class="ambe-note" id="ambeNote">Each DMR voice burst should yield three de-interleaved 72-bit AMBE+2 channel/FEC blocks. Continuous voice should approach one burst every 60 ms, or about 50 coded AMBE blocks/sec.</div>
          <pre class="ambe-hex" id="ambeHex" hidden></pre>
        </section>

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

  function hexToBytes(hex) {
    if (typeof hex !== 'string' || !/^[0-9a-f]{66}$/i.test(hex)) throw new Error('invalid 33-byte DMR frame');
    const bytes = new Uint8Array(33);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }

  function bitAt(bytes, position) {
    return (bytes[position >> 3] & (0x80 >> (position & 7))) ? 1 : 0;
  }

  function bitsToHex(bits) {
    let out = '';
    for (let i = 0; i < bits.length; i += 8) {
      let value = 0;
      for (let j = 0; j < 8; j++) value = (value << 1) | (bits[i + j] || 0);
      out += value.toString(16).padStart(2, '0');
    }
    return out;
  }

  function mappedPosition(position, block) {
    if (block === 0) return position;
    if (block === 1) {
      let out = position + 72;
      if (out >= 108) out += 48; // skip the DMR sync/embedded-signalling center
      return out;
    }
    return position + 192;
  }

  function extractAmbeChannelBlocks(frameHex) {
    const bytes = hexToBytes(frameHex);
    const blocks = [];
    for (let block = 0; block < 3; block++) {
      const bits = [];
      DMR_A_TABLE.forEach(position => bits.push(bitAt(bytes, mappedPosition(position, block))));
      DMR_B_TABLE.forEach(position => bits.push(bitAt(bytes, mappedPosition(position, block))));
      DMR_C_TABLE.forEach(position => bits.push(bitAt(bytes, mappedPosition(position, block))));
      if (bits.length !== 72) throw new Error('AMBE channel block length mismatch');
      blocks.push(bitsToHex(bits));
    }
    return blocks;
  }

  function average(values) {
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function observeAmbe(frame) {
    try {
      const blocks = extractAmbeChannelBlocks(frame.frame_hex);
      lastAmbeBlocks = blocks;
      ambeBlockCount += blocks.length;

      const at = Number(frame.received_at);
      const key = `${frame.source}:${frame.slot}:${frame.src_id}:${frame.dst_id}:${frame.group ? 1 : 0}`;
      if (Number.isFinite(at)) {
        if (lastBurstKey === key && Number.isFinite(lastBurstAt)) {
          const deltaMs = (at - lastBurstAt) * 1000;
          if (deltaMs > 20 && deltaMs < 180) {
            cadenceSamples.push(deltaMs);
            if (cadenceSamples.length > 80) cadenceSamples = cadenceSamples.slice(-80);
          } else if (deltaMs >= 350) {
            cadenceSamples = [];
          }
        } else if (lastBurstKey && lastBurstKey !== key) {
          cadenceSamples = [];
        }
        lastBurstAt = at;
        lastBurstKey = key;
      }
    } catch (_) {
      extractionErrors += 1;
    }
  }

  function renderAmbe() {
    byId('ambeCount').textContent = String(ambeBlockCount);
    byId('ambeBurst').textContent = lastAmbeBlocks.length ? `${lastAmbeBlocks.length} × 72-bit` : '—';
    byId('ambeErrors').textContent = String(extractionErrors);

    const avgMs = average(cadenceSamples);
    const rate = avgMs ? 3000 / avgMs : null;
    byId('ambeCadence').textContent = avgMs ? `${avgMs.toFixed(1)} ms` : '—';
    byId('ambeRate').textContent = rate ? `${rate.toFixed(1)} /s` : '—';

    const good = lastAmbeBlocks.length === 3 && extractionErrors === 0 && cadenceSamples.length >= 5 && avgMs >= 45 && avgMs <= 75;
    const state = byId('ambeState');
    if (good) {
      state.className = 'ambe-state good';
      state.textContent = 'CADENCE GOOD';
      byId('ambeNote').textContent = `Three 72-bit coded AMBE+2 blocks are being extracted per DMR burst. Average burst cadence ${avgMs.toFixed(1)} ms · estimated coded-block rate ${rate.toFixed(1)}/s.`;
    } else if (lastAmbeBlocks.length === 3) {
      state.className = 'ambe-state active';
      state.textContent = cadenceSamples.length >= 5 ? 'CHECK CADENCE' : 'EXTRACTING';
      byId('ambeNote').textContent = cadenceSamples.length >= 5
        ? `Block extraction is healthy; measured burst cadence is ${avgMs.toFixed(1)} ms. More continuous voice may be needed for a stable ~60 ms sample.`
        : 'Three coded AMBE+2 blocks are being extracted from each burst. Keep a continuous Parrot transmission/return going long enough to validate cadence.';
    } else {
      state.className = 'ambe-state waiting';
      state.textContent = 'WAITING';
    }

    const hex = byId('ambeHex');
    hex.hidden = !config.show_ambe_hex;
    if (config.show_ambe_hex) {
      hex.textContent = lastAmbeBlocks.length
        ? lastAmbeBlocks.map((value, index) => `block ${index + 1}: ${value}`).join('\n')
        : 'No AMBE channel blocks extracted yet.';
    }
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
      observeAmbe(frame);
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
      renderAmbe();
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
      renderAmbe();
      renderFrames();
      poll();
    } catch (error) {
      setBridge('error', `RX Monitor failed to initialize: ${String(error?.message || error)}`);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
