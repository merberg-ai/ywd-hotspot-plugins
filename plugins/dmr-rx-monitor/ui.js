'use strict';
(() => {
  const root = document.getElementById('ywd-plugin-root');
  let config = {
    max_rows: 40,
    show_raw_hex: false,
    show_ambe_hex: false,
    show_vocoder_hex: false,
    capture_seconds: 10,
    source_filter: 'all'
  };

  let cursor = 0;
  let recent = [];
  let total = 0;
  let rfCount = 0;
  let networkCount = 0;
  let droppedCount = 0;
  let lastFrame = null;
  let pollTimer = null;

  // DMR AMBE+2 burst interleave maps. These match the pinned MMDVM-Host
  // AMBEFEC implementation already validated by RX Monitor Phase 3A.
  const DMR_A_TABLE = [0,4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64,68,1,5,9,13,17,21];
  const DMR_B_TABLE = [25,29,33,37,41,45,49,53,57,61,65,69,2,6,10,14,18,22,26,30,34,38,42];
  const DMR_C_TABLE = [46,50,54,58,62,66,70,3,7,11,15,19,23,27,31,35,39,43,47,51,55,59,63,67,71];

  // Golay(23,12) systematic parity generators used by mbelib's AMBE 3600x2450
  // FEC path. Phase 3B implements only FEC/demodulation and 49-bit frame
  // recovery; no speech synthesis/vocoder decoding is included here.
  const GOLAY_GENERATOR = [0x63a,0x31d,0x7b4,0x3da,0x1ed,0x6cc,0x366,0x1b3,0x6e3,0x54b,0x49f,0x475];
  const GOLAY_CODEWORDS = new Uint32Array(4096);

  let codedBlockCount = 0;
  let extractionErrors = 0;
  let vocoderFrameCount = 0;
  let fecCorrectedFrames = 0;
  let fecCorrectedBits = 0;
  let unrecoverableFrames = 0;
  let sequenceGaps = 0;
  let lastCodedBlocks = [];
  let lastVocoderFrames = [];
  let cadenceSamples = [];
  let lastBurstAt = null;
  let lastBurstKey = '';
  const streamSequence = new Map();
  let capture = [];

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const byId = id => document.getElementById(id);

  function shell() {
    root.innerHTML = `
      <main class="rx-shell">
        <header class="rx-header">
          <div>
            <div class="eyebrow">YWD PLUGIN UI v1 · PASSIVE DMR</div>
            <h1>DMR RX Monitor</h1>
            <p>Capability-gated DMR receive diagnostics. No serial, MQTT, RF ownership, or direct network access.</p>
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
              <div class="label">PHASE 3B · 49-BIT AMBE+2 FRAME RECOVERY</div>
              <div class="panel-note">Browser-side FEC, de-scrambling, continuity diagnostics, and bounded capture export. Still no audio decoding.</div>
            </div>
            <div class="phase-actions">
              <button class="rx-btn" id="exportCapture" disabled>EXPORT CAPTURE</button>
              <button class="rx-btn subtle" id="clearCapture" disabled>CLEAR</button>
              <div class="ambe-state waiting" id="ambeState">WAITING</div>
            </div>
          </div>

          <div class="ambe-grid phase3b-grid">
            <article><div class="label">CODED BLOCKS</div><div class="ambe-value" id="ambeCount">0</div></article>
            <article><div class="label">49-BIT FRAMES</div><div class="ambe-value" id="vocoderCount">0</div></article>
            <article><div class="label">FEC FRAMES</div><div class="ambe-value" id="fecFrames">0</div></article>
            <article><div class="label">CORRECTED BITS</div><div class="ambe-value" id="fecBits">0</div></article>
            <article><div class="label">UNRECOVERABLE</div><div class="ambe-value" id="unrecoverableCount">0</div></article>
            <article><div class="label">SEQ GAPS</div><div class="ambe-value" id="sequenceGaps">0</div></article>
            <article><div class="label">FRAME RATE</div><div class="ambe-value" id="ambeRate">—</div></article>
            <article><div class="label">CAPTURE</div><div class="ambe-value" id="captureCount">0</div></article>
          </div>

          <div class="ambe-note" id="ambeNote">Each DMR burst should yield three corrected/demodulated 49-bit AMBE+2 vocoder frames. Export Capture keeps only a short bounded browser-side ring for offline diagnostics.</div>
          <pre class="ambe-hex" id="ambeHex" hidden></pre>
          <pre class="ambe-hex vocoder-hex" id="vocoderHex" hidden></pre>
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
    return `${frame.src_id}  →  ${frame.group ? 'TG' : 'PC'} ${frame.dst_id}`;
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
    for (let i = 0; i < bits.length; i += 4) {
      let value = 0;
      for (let j = 0; j < 4; j++) value = (value << 1) | (bits[i + j] || 0);
      out += value.toString(16);
    }
    return out;
  }

  function bitsToInt(bits) {
    let value = 0;
    for (const bit of bits) value = ((value << 1) | (bit ? 1 : 0)) >>> 0;
    return value >>> 0;
  }

  function intToBits(value, count) {
    const bits = new Array(count);
    for (let i = 0; i < count; i++) bits[i] = (value >>> (count - 1 - i)) & 1;
    return bits;
  }

  function popcount32(value) {
    let x = value >>> 0;
    x -= (x >>> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }

  function buildGolayCodebook() {
    for (let data = 0; data < 4096; data++) {
      let parity = 0;
      for (let i = 0; i < 12; i++) {
        if (data & (1 << (11 - i))) parity ^= GOLAY_GENERATOR[i];
      }
      GOLAY_CODEWORDS[data] = ((data << 11) | parity) >>> 0;
    }
  }

  function decodeGolay2312(bits) {
    const input = bitsToInt(bits) & 0x7fffff;
    let bestData = 0;
    let bestDistance = 24;
    for (let data = 0; data < 4096; data++) {
      const distance = popcount32((input ^ GOLAY_CODEWORDS[data]) & 0x7fffff);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestData = data;
        if (distance === 0) break;
      }
    }
    return {valid: bestDistance <= 3, data: bestData, corrected: bestDistance};
  }

  function mappedPosition(position, block) {
    if (block === 0) return position;
    if (block === 1) {
      let out = position + 72;
      if (out >= 108) out += 48;
      return out;
    }
    return position + 192;
  }

  function extractAmbeCodewords(frameHex) {
    const bytes = hexToBytes(frameHex);
    const words = [];
    for (let block = 0; block < 3; block++) {
      const a = DMR_A_TABLE.map(position => bitAt(bytes, mappedPosition(position, block)));
      const b = DMR_B_TABLE.map(position => bitAt(bytes, mappedPosition(position, block)));
      const c = DMR_C_TABLE.map(position => bitAt(bytes, mappedPosition(position, block)));
      if (a.length !== 24 || b.length !== 23 || c.length !== 25) throw new Error('AMBE channel block length mismatch');
      words.push({a, b, c, codedHex: bitsToHex([...a, ...b, ...c])});
    }
    return words;
  }

  function demodulateB(bits, seed) {
    let pr = (16 * seed) & 0xffff;
    const out = bits.slice();
    for (let i = 0; i < 23; i++) {
      pr = ((173 * pr) + 13849) & 0xffff;
      out[i] ^= pr >= 32768 ? 1 : 0;
    }
    return out;
  }

  function recoverVocoderFrame(word) {
    const a = decodeGolay2312(word.a.slice(0, 23));
    if (!a.valid) return {valid:false, stage:'C0', corrected:a.corrected};

    const bDemod = demodulateB(word.b, a.data);
    const b = decodeGolay2312(bDemod);
    if (!b.valid) return {valid:false, stage:'C1', corrected:a.corrected + b.corrected};

    const bits = [
      ...intToBits(a.data, 12),
      ...intToBits(b.data, 12),
      ...word.c
    ];
    if (bits.length !== 49) return {valid:false, stage:'length', corrected:a.corrected + b.corrected};

    return {
      valid: true,
      bits,
      hex: bitsToHex(bits),
      corrected: a.corrected + b.corrected,
      aCorrected: a.corrected,
      bCorrected: b.corrected
    };
  }

  function average(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }

  function streamKey(frame) {
    return `${frame.source}:${frame.slot}:${frame.src_id}:${frame.dst_id}:${frame.group ? 1 : 0}`;
  }

  function observeSequence(frame) {
    const seq = Number(frame.seq_no);
    const at = Number(frame.received_at);
    if (!Number.isInteger(seq) || !Number.isFinite(at)) return;
    const key = streamKey(frame);
    const prev = streamSequence.get(key);
    if (prev && (at - prev.at) < 0.6) {
      const expected = (prev.seq + 1) & 0xff;
      if ((seq & 0xff) !== expected) {
        const missing = ((seq & 0xff) - expected + 256) & 0xff;
        sequenceGaps += missing > 0 && missing < 32 ? missing : 1;
      }
    }
    streamSequence.set(key, {seq:seq & 0xff, at});
    if (streamSequence.size > 16) {
      for (const [k, v] of streamSequence) if ((at - v.at) > 2) streamSequence.delete(k);
    }
  }

  function captureLimit() {
    const seconds = Math.max(5, Math.min(20, Number(config.capture_seconds) || 10));
    return Math.round(seconds * 50);
  }

  function pushCapture(frame, recovered, index) {
    capture.push({
      t: Number(frame.received_at) || 0,
      path: frame.source,
      slot: Number(frame.slot),
      src: Number(frame.src_id),
      dst: Number(frame.dst_id),
      group: !!frame.group,
      burst_seq: Number(frame.seq),
      dmr_seq: Number(frame.seq_no),
      n: Number(frame.n),
      index,
      ambe49: recovered.hex,
      fec: recovered.corrected
    });
    const limit = captureLimit();
    if (capture.length > limit) capture = capture.slice(-limit);
  }

  function observeAmbe(frame) {
    try {
      observeSequence(frame);
      const words = extractAmbeCodewords(frame.frame_hex);
      lastCodedBlocks = words.map(word => word.codedHex);
      codedBlockCount += words.length;

      const recoveredNow = [];
      words.forEach((word, index) => {
        const recovered = recoverVocoderFrame(word);
        if (!recovered.valid) {
          unrecoverableFrames += 1;
          recoveredNow.push(null);
          return;
        }
        vocoderFrameCount += 1;
        if (recovered.corrected > 0) {
          fecCorrectedFrames += 1;
          fecCorrectedBits += recovered.corrected;
        }
        recoveredNow.push(recovered);
        pushCapture(frame, recovered, index);
      });
      lastVocoderFrames = recoveredNow;

      const at = Number(frame.received_at);
      const key = streamKey(frame);
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
    byId('ambeCount').textContent = String(codedBlockCount);
    byId('vocoderCount').textContent = String(vocoderFrameCount);
    byId('fecFrames').textContent = String(fecCorrectedFrames);
    byId('fecBits').textContent = String(fecCorrectedBits);
    byId('unrecoverableCount').textContent = String(unrecoverableFrames + extractionErrors);
    byId('sequenceGaps').textContent = String(sequenceGaps);
    byId('captureCount').textContent = String(capture.length);

    const avgMs = average(cadenceSamples);
    const rate = avgMs ? 3000 / avgMs : null;
    byId('ambeRate').textContent = rate ? `${rate.toFixed(1)} /s` : '—';

    const enough = vocoderFrameCount >= 15;
    const errors = unrecoverableFrames + extractionErrors;
    const state = byId('ambeState');
    if (!enough) {
      state.className = 'ambe-state waiting';
      state.textContent = vocoderFrameCount ? 'RECOVERING' : 'WAITING';
    } else if (errors || sequenceGaps) {
      state.className = 'ambe-state error';
      state.textContent = 'CHECK STREAM';
    } else if (fecCorrectedFrames) {
      state.className = 'ambe-state active';
      state.textContent = 'FEC ACTIVE';
    } else {
      state.className = 'ambe-state good';
      state.textContent = 'STREAM CLEAN';
    }

    const cadence = avgMs ? `${avgMs.toFixed(1)} ms bursts / ${rate.toFixed(1)} AMBE frames/s` : 'collecting cadence';
    byId('ambeNote').textContent =
      `${vocoderFrameCount} recovered 49-bit frames · ${fecCorrectedFrames} frames corrected (${fecCorrectedBits} coded bits) · ` +
      `${errors} unrecoverable/extract errors · ${sequenceGaps} sequence gaps · ${cadence}. ` +
      `Capture ring: ${capture.length}/${captureLimit()} frames.`;

    const codedHex = byId('ambeHex');
    codedHex.hidden = !config.show_ambe_hex;
    if (config.show_ambe_hex) {
      codedHex.textContent = lastCodedBlocks.length
        ? lastCodedBlocks.map((value, index) => `coded ${index + 1}: ${value}`).join('\n')
        : 'No coded AMBE channel blocks extracted yet.';
    }

    const vocoderHex = byId('vocoderHex');
    vocoderHex.hidden = !config.show_vocoder_hex;
    if (config.show_vocoder_hex) {
      vocoderHex.textContent = lastVocoderFrames.length
        ? lastVocoderFrames.map((value, index) => value
          ? `ambe49 ${index + 1}: ${value.hex}  fec=${value.corrected}`
          : `ambe49 ${index + 1}: UNRECOVERABLE`).join('\n')
        : 'No 49-bit vocoder frames recovered yet.';
    }

    byId('exportCapture').disabled = capture.length === 0;
    byId('clearCapture').disabled = capture.length === 0;
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

  function captureFilename() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `ywd-dmr-rx-capture-${stamp}.json`;
  }

  function exportCapture() {
    if (!capture.length) return;
    const payload = {
      format: 'ywd-dmr-rx-capture',
      schema: 1,
      plugin: {id:'dmr-rx-monitor', version:'0.3.0'},
      exported_at: new Date().toISOString(),
      frame_encoding: {
        type: 'AMBE+2 2450 vocoder data',
        bits: 49,
        bit_order: 'MSB-first',
        storage: '13 hex nibbles; final nibble is zero-padded on the right',
        cadence: 'nominally 20 ms per recovered AMBE frame'
      },
      capture: {
        configured_seconds: Math.max(5, Math.min(20, Number(config.capture_seconds) || 10)),
        frames: capture.length,
        session_counters: {
          dmr_frames: total,
          coded_blocks: codedBlockCount,
          recovered_49bit: vocoderFrameCount,
          fec_corrected_frames: fecCorrectedFrames,
          fec_corrected_bits: fecCorrectedBits,
          unrecoverable: unrecoverableFrames + extractionErrors,
          sequence_gaps: sequenceGaps
        }
      },
      frames: capture
    };

    const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = captureFilename();
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    byId('notice').textContent = `Capture exported: ${capture.length} recovered AMBE frames.`;
  }

  function clearCapture() {
    capture = [];
    renderAmbe();
    byId('notice').textContent = 'Capture ring cleared. Session diagnostics were preserved.';
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
        ? `Trusted voice bridge online${Number.isFinite(age) ? ` · heartbeat ${age.toFixed(1)}s ago` : ''}. FEC and capture processing stay inside this sandboxed browser UI.`
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
    buildGolayCodebook();
    byId('exportCapture').addEventListener('click', exportCapture);
    byId('clearCapture').addEventListener('click', clearCapture);
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
