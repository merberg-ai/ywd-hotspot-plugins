'use strict';
(() => {
  const root = document.getElementById('ywd-plugin-root');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const known = new Map();
  let config = {auto_refresh:true, refresh_seconds:4, recent_limit:15};
  let timer = null;
  let directoryMeta = null;
  let busy = false;
  let lookupBusy = false;
  let lookupTicker = null;

  root.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <div class="eyebrow">YWD · DMR IDENTITY</div>
          <h1>Contact Intelligence</h1>
          <p>Local callsign lookup plus the DMR activity your hotspot is actually seeing.</p>
        </div>
        <span id="bridgeStatus" class="pill pending">CONNECTING</span>
      </header>

      <section class="panel lookup-panel">
        <div class="section-head">
          <div><span class="kicker">DIRECTORY</span><h2>Find a station</h2></div>
          <div id="directoryStatus" class="meta">Local RadioID directory</div>
        </div>
        <div id="lookupControls" class="lookup-form">
          <input id="lookupInput" type="text" maxlength="32" autocomplete="off" spellcheck="false" placeholder="Callsign or DMR ID" aria-label="Callsign or DMR ID">
          <button id="lookupButton" type="button"><span class="lookup-spinner" aria-hidden="true"></span><span id="lookupButtonLabel">LOOK UP</span></button>
        </div>
        <div id="lookupMessage" class="hint lookup-status" role="status" aria-live="polite">Try a callsign such as KJ6YWD or a numeric DMR ID.</div>
        <div id="lookupResults" class="results"></div>
      </section>

      <section class="panel">
        <div class="section-head">
          <div><span class="kicker">LIVE</span><h2>On the air now</h2></div>
          <button id="refreshButton" class="ghost" type="button">REFRESH</button>
        </div>
        <div id="currentActivity" class="current idle">No active DMR voice session.</div>
      </section>

      <section class="panel">
        <div class="section-head">
          <div><span class="kicker">OBSERVED</span><h2>Recent activity</h2></div>
          <div id="updatedAt" class="meta">—</div>
        </div>
        <div id="activityRows" class="activity-list"><div class="empty">Waiting for activity…</div></div>
      </section>

      <footer>Contact Intelligence 0.1.0-alpha3 · local hotspot DMR directory · no arbitrary network access.</footer>
    </main>`;

  const $ = id => document.getElementById(id);

  function number(value, fallback, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
  }

  function age(ts) {
    const t = Number(ts);
    if (!Number.isFinite(t) || t <= 0) return 'unknown';
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - t));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function timeLabel(ts) {
    const t = Number(ts);
    if (!Number.isFinite(t) || t <= 0) return '—';
    try { return new Date(t * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}); }
    catch (_) { return '—'; }
  }

  function duration(event) {
    const n = Number(event?.duration_s);
    return Number.isFinite(n) ? `${n.toFixed(1)}s` : (event?.active ? 'LIVE' : '—');
  }

  function dmrId(event) {
    const n = Number(event?.source?.dmr_id);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function identity(event) {
    const ident = dmrId(event);
    const supplied = String(event?.source?.callsign || '').trim().toUpperCase();
    const resolved = ident ? known.get(ident) : null;
    const call = supplied || resolved || '';
    return {
      primary: call || String(event?.source?.display || ident || 'Unknown'),
      secondary: ident ? `DMR ID ${ident}` : (call ? 'Callsign from activity' : 'No numeric DMR ID'),
      ident,
      call,
    };
  }

  function destination(event) {
    const d = event?.destination || {};
    const text = String(d.display || d.id || 'Unknown');
    return d.group ? `TG ${text}` : `ID ${text}`;
  }

  function renderCurrent(event) {
    const box = $('currentActivity');
    if (!event?.active) {
      box.className = 'current idle';
      box.innerHTML = '<div class="signal-dot"></div><div><b>Idle</b><span>No active DMR voice session.</span></div>';
      return;
    }
    const who = identity(event);
    box.className = `current active ${String(event.path || '').toLowerCase()}`;
    box.innerHTML = `
      <div class="signal-dot"></div>
      <div class="current-main"><b>${esc(who.primary)}</b><span>${esc(who.secondary)}</span></div>
      <div class="current-dest"><b>${esc(destination(event))}</b><span>${esc(event.path || '')} · Slot ${esc(event.slot ?? '—')}</span></div>`;
  }

  function renderRows(rows) {
    const list = $('activityRows');
    if (!Array.isArray(rows) || !rows.length) {
      list.innerHTML = '<div class="empty">No DMR activity has been recorded yet.</div>';
      return;
    }
    list.innerHTML = rows.map(event => {
      const who = identity(event);
      const metric = event?.path === 'RF' && Number.isFinite(Number(event?.ber_pct))
        ? `BER ${Number(event.ber_pct).toFixed(1)}%`
        : Number.isFinite(Number(event?.packet_loss_pct)) ? `LOSS ${Number(event.packet_loss_pct).toFixed(0)}%` : '';
      return `<article class="activity-row">
        <div class="who"><b>${esc(who.primary)}</b><span>${esc(who.secondary)}</span></div>
        <div class="where"><b>${esc(destination(event))}</b><span>${esc(event.path || 'DMR')} · ${esc(metric || event.status || '')}</span></div>
        <div class="when"><b>${esc(duration(event))}</b><span>${esc(timeLabel(event.started_at))}</span></div>
      </article>`;
    }).join('');
  }

  function updateDirectoryMeta(meta) {
    if (meta && typeof meta === 'object') directoryMeta = meta;
    const m = directoryMeta;
    if (!m) return;
    const text = m.present === false
      ? 'Local directory unavailable'
      : `${m.source || 'Local directory'}${m.updated_at ? ` · updated ${age(m.updated_at)}` : ''}`;
    $('directoryStatus').textContent = text;
  }

  async function resolveRows(activity) {
    const events = [activity?.current, ...(Array.isArray(activity?.lastheard) ? activity.lastheard : [])].filter(Boolean);
    const ids = [...new Set(events.map(dmrId).filter(Boolean))].filter(id => !known.has(id));
    if (!ids.length) return;
    try {
      const response = await window.ywdPlugin.lookupDmrIds(ids);
      updateDirectoryMeta(response?.database);
      for (const row of Array.isArray(response?.results) ? response.results : []) {
        const ident = Number(row?.dmr_id);
        if (Number.isInteger(ident) && ident > 0) known.set(ident, row?.callsign ? String(row.callsign).toUpperCase() : '');
      }
    } catch (error) {
      console.warn('Contact Intelligence directory resolution failed:', error);
    }
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    $('refreshButton').disabled = true;
    try {
      const activity = await window.ywdPlugin.readDmrActivity({limit:config.recent_limit});
      await resolveRows(activity);
      renderCurrent(activity?.current || {});
      renderRows(activity?.lastheard || []);
      $('updatedAt').textContent = activity?.updated_at ? `Updated ${age(activity.updated_at)}` : 'Updated now';
      $('bridgeStatus').className = 'pill good';
      $('bridgeStatus').textContent = 'LIVE';
    } catch (error) {
      $('bridgeStatus').className = 'pill bad';
      $('bridgeStatus').textContent = 'ERROR';
      $('currentActivity').className = 'current idle';
      $('currentActivity').textContent = String(error?.message || error);
    } finally {
      busy = false;
      $('refreshButton').disabled = false;
    }
  }

  function renderSearch(rows) {
    const results = $('lookupResults');
    if (!rows.length) {
      results.innerHTML = '<div class="empty">No matching local DMR contact found.</div>';
      return;
    }
    results.innerHTML = rows.map(row => `
      <article class="result-row">
        <div><b>${esc(row.callsign || 'Unknown')}</b><span>DMR ID ${esc(row.dmr_id ?? '—')}</span></div>
        <span class="source-tag">LOCAL</span>
      </article>`).join('');
  }

  function setLookupState(state, text) {
    const message = $('lookupMessage');
    const button = $('lookupButton');
    message.className = `hint lookup-status ${state || ''}`.trim();
    if (text !== undefined) message.textContent = String(text);
    button.classList.toggle('busy', state === 'busy');
    button.disabled = state === 'busy';
    $('lookupInput').disabled = state === 'busy';
    $('lookupButtonLabel').textContent = state === 'busy' ? 'LOOKING UP…' : 'LOOK UP';
  }

  function lookupSummary(rows, response, clientMs) {
    const diag = response?.diagnostics || {};
    const elapsed = Number.isFinite(Number(diag.elapsed_ms)) ? Number(diag.elapsed_ms) : Math.max(0, Math.round(clientMs));
    const scanned = Number.isFinite(Number(diag.scanned_records)) ? Number(diag.scanned_records) : null;
    const parts = [`${rows.length} local match${rows.length === 1 ? '' : 'es'}`, `${elapsed} ms`];
    if (diag.cache_hit) parts.push('recent cache');
    else if (scanned !== null) parts.push(`${scanned.toLocaleString()} records checked`);
    return parts.join(' · ');
  }

  function nextPaint() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  async function search(query) {
    if (lookupBusy) return;
    lookupBusy = true;
    const started = performance.now();
    const results = $('lookupResults');
    results.innerHTML = '';
    setLookupState('busy', 'Searching the local RadioID directory…');
    clearInterval(lookupTicker);
    lookupTicker = setInterval(() => {
      const seconds = Math.max(1, Math.floor((performance.now() - started) / 1000));
      setLookupState('busy', `Searching the local RadioID directory… ${seconds}s`);
    }, 1000);

    await nextPaint();
    try {
      const response = await window.ywdPlugin.searchDmrDirectory(query, {limit:15});
      updateDirectoryMeta(response?.database);
      const rows = Array.isArray(response?.results) ? response.results : [];
      for (const row of rows) {
        const ident = Number(row?.dmr_id);
        if (Number.isInteger(ident) && ident > 0) known.set(ident, row?.callsign ? String(row.callsign).toUpperCase() : '');
      }
      renderSearch(rows);
      setLookupState(rows.length ? 'good' : 'idle', lookupSummary(rows, response, performance.now() - started));
    } catch (error) {
      results.innerHTML = '<div class="empty error-box">Lookup failed. The activity feed remains unaffected.</div>';
      setLookupState('bad', `Lookup error: ${String(error?.message || error)}`);
    } finally {
      clearInterval(lookupTicker);
      lookupTicker = null;
      lookupBusy = false;
      $('lookupButton').classList.remove('busy');
      $('lookupButton').disabled = false;
      $('lookupInput').disabled = false;
      $('lookupButtonLabel').textContent = 'LOOK UP';
      try { $('lookupInput').focus({preventScroll:true}); } catch (_) {}
    }
  }

  function runLookup() {
    const query = $('lookupInput').value.trim();
    if (!query) {
      setLookupState('bad', 'Enter a callsign or numeric DMR ID first.');
      return;
    }
    void search(query);
  }

  $('lookupButton').addEventListener('click', runLookup);
  $('lookupInput').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    runLookup();
  });
  $('refreshButton').addEventListener('click', () => void refresh());

  async function init() {
    try {
      await window.ywdPlugin.ready;
      const saved = await window.ywdPlugin.getConfig();
      config = {
        auto_refresh: saved?.auto_refresh !== false,
        refresh_seconds: number(saved?.refresh_seconds, 4, 2, 30),
        recent_limit: number(saved?.recent_limit, 15, 5, 30),
      };
      await refresh();
      if (config.auto_refresh) timer = setInterval(refresh, config.refresh_seconds * 1000);
    } catch (error) {
      $('bridgeStatus').className = 'pill bad';
      $('bridgeStatus').textContent = 'OFFLINE';
      $('currentActivity').textContent = String(error?.message || error);
    }
  }

  window.addEventListener('pagehide', () => {
    if (timer) clearInterval(timer);
    if (lookupTicker) clearInterval(lookupTicker);
  }, {once:true});
  void init();
})();
