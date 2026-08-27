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
  let observedCollapsed = false;

  root.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <div class="eyebrow">YWD · DMR IDENTITY</div>
          <h1>Contact Intelligence</h1>
          <p>Search the DMR directory and see the activity your hotspot is hearing.</p>
        </div>
        <span id="bridgeStatus" class="pill pending">CONNECTING</span>
      </header>

      <section id="lookupPanel" class="panel lookup-panel">
        <div class="section-head">
          <div><span class="kicker">DIRECTORY</span><h2>Find a station</h2></div>
          <div id="directoryStatus" class="meta">RadioID directory</div>
        </div>
        <div id="lookupControls" class="lookup-form">
          <input id="lookupInput" type="text" maxlength="32" autocomplete="off" spellcheck="false" placeholder="Callsign or DMR ID" aria-label="Callsign or DMR ID">
          <button id="lookupButton" type="button"><span class="lookup-spinner" aria-hidden="true"></span><span id="lookupButtonLabel">LOOK UP</span></button>
        </div>
        <div id="lookupMessage" class="hint lookup-status" role="status" aria-live="polite">Search by callsign or numeric DMR ID.</div>
        <div id="lookupResults" class="results"></div>
      </section>

      <section class="panel">
        <div class="section-head">
          <div><span class="kicker">LIVE</span><h2>On the air now</h2></div>
          <button id="refreshButton" class="ghost" type="button">REFRESH</button>
        </div>
        <div id="currentActivity" class="current idle">No active DMR voice session.</div>
      </section>

      <section id="observedPanel" class="panel collapsible-panel">
        <div class="section-head observed-head">
          <div><span class="kicker">OBSERVED</span><h2>Recent activity</h2></div>
          <div class="observed-actions">
            <div id="updatedAt" class="meta">—</div>
            <button id="observedToggle" class="ghost collapse-toggle" type="button" aria-expanded="true" aria-controls="observedBody">
              <span id="observedToggleLabel">HIDE</span><span class="chevron" aria-hidden="true">⌃</span>
            </button>
          </div>
        </div>
        <div id="observedBody">
          <div id="activityRows" class="activity-list"><div class="empty">Waiting for activity…</div></div>
        </div>
      </section>
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
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(t * 1000).toLocaleDateString();
  }

  function dateTime(ts) {
    const t = Number(ts);
    if (!Number.isFinite(t) || t <= 0) return '—';
    try { return new Date(t * 1000).toLocaleString([], {dateStyle:'medium', timeStyle:'short'}); }
    catch (_) { return '—'; }
  }

  function compactDateTime(ts) {
    const t = Number(ts);
    if (!Number.isFinite(t) || t <= 0) return '—';
    try {
      const date = new Date(t * 1000);
      const options = {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'};
      if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
      return date.toLocaleString([], options);
    } catch (_) { return '—'; }
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

  function airtime(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
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

  function stationQuery(who) {
    if (who?.ident) return String(who.ident);
    return String(who?.call || '').trim().toUpperCase();
  }

  function stationLabel(who) {
    return String(who?.call || who?.primary || '').trim().toUpperCase();
  }

  function stationControl(who, extraClass = '') {
    const query = stationQuery(who);
    if (!query) return `<b>${esc(who?.primary || 'Unknown')}</b>`;
    return `<button type="button" class="station-link ${esc(extraClass)}" data-station-query="${esc(query)}" data-station-label="${esc(stationLabel(who))}">${esc(who?.primary || query)}</button>`;
  }

  function destination(event) {
    const d = event?.destination || {};
    const text = String(d.display || d.id || 'Unknown');
    return d.group ? `TG ${text}` : `ID ${text}`;
  }

  function destinationFromObservation(obs) {
    if (!obs || obs.last_destination === null || obs.last_destination === undefined) return '';
    return obs.last_group ? `TG ${obs.last_destination}` : `ID ${obs.last_destination}`;
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
      <div class="current-main">${stationControl(who, 'current-station-link')}<span>${esc(who.secondary)}</span></div>
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
        <div class="who">${stationControl(who)}<span>${esc(who.secondary)}</span></div>
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
      ? 'Directory unavailable'
      : `${m.source || 'Directory'}${m.updated_at ? ` · updated ${age(m.updated_at)}` : ''}`;
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
      const rows = Array.isArray(activity?.lastheard) ? activity.lastheard : [];
      renderCurrent(activity?.current || {});
      renderRows(rows);
      const updated = activity?.updated_at ? `updated ${age(activity.updated_at)}` : 'updated now';
      $('updatedAt').textContent = `${rows.length} recent · ${updated}`;
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

  function observationsFor(row, response) {
    const entries = Array.isArray(response?.observations?.results) ? response.observations.results : [];
    const ident = Number(row?.dmr_id);
    const call = String(row?.callsign || '').toUpperCase();
    const matches = entries.filter(item => {
      const itemId = Number(item?.dmr_id);
      const itemCall = String(item?.callsign || '').toUpperCase();
      return (Number.isInteger(ident) && ident > 0 && itemId === ident) || (call && itemCall === call);
    });
    if (!matches.length) return null;
    const out = {qso_count:0, rf_count:0, network_count:0, total_duration_s:0, first_seen:null, last_seen:null};
    for (const item of matches) {
      out.qso_count += Number(item?.qso_count) || 0;
      out.rf_count += Number(item?.rf_count) || 0;
      out.network_count += Number(item?.network_count) || 0;
      out.total_duration_s += Number(item?.total_duration_s) || 0;
      const first = Number(item?.first_seen) || 0;
      const last = Number(item?.last_seen) || 0;
      if (first && (!out.first_seen || first < out.first_seen)) out.first_seen = first;
      if (last >= (out.last_seen || 0)) {
        out.last_seen = last || out.last_seen;
        out.last_destination = item?.last_destination;
        out.last_group = !!item?.last_group;
        out.last_path = item?.last_path || '';
        out.last_slot = item?.last_slot;
      }
    }
    return out.qso_count ? out : null;
  }

  function locationLabel(row) {
    const parts = [row?.city, row?.state, row?.country].map(x => String(x || '').trim()).filter(Boolean);
    return parts.join(', ');
  }

  function renderSearch(rows, response) {
    const results = $('lookupResults');
    if (!rows.length) {
      results.innerHTML = '<div class="empty">No matching station found.</div>';
      return;
    }
    results.innerHTML = rows.map(row => {
      const obs = observationsFor(row, response);
      const location = locationLabel(row);
      const name = String(row?.name || '').trim();
      const lastDest = destinationFromObservation(obs);
      const history = obs
        ? `<div class="history-grid">
            <div><span>FIRST SEEN</span><b class="history-time" title="${esc(dateTime(obs.first_seen))}">${esc(compactDateTime(obs.first_seen))}</b></div>
            <div><span>LAST HEARD</span><b>${esc(age(obs.last_seen))}</b></div>
            <div><span>QSOs</span><b>${esc(obs.qso_count)}</b></div>
            <div><span>AIRTIME</span><b>${esc(airtime(obs.total_duration_s))}</b></div>
            <div><span>PATHS</span><b>${esc(`${obs.rf_count} RF · ${obs.network_count} NET`)}</b></div>
          </div>
          ${lastDest ? `<div class="last-route">Last: <b>${esc(lastDest)}</b>${obs.last_path ? ` · ${esc(obs.last_path)}` : ''}${obs.last_slot ? ` · Slot ${esc(obs.last_slot)}` : ''}</div>` : ''}`
        : '<div class="station-unseen">No completed QSOs observed by this hotspot yet.</div>';
      return `<article class="result-card">
        <div class="result-top">
          <div class="station-id"><b>${esc(row.callsign || 'Unknown')}</b><span>DMR ID ${esc(row.dmr_id ?? '—')}</span></div>
          <span class="source-tag">RADIOID</span>
        </div>
        ${(name || location) ? `<div class="station-profile">${name ? `<b>${esc(name)}</b>` : ''}${location ? `<span>${esc(location)}</span>` : ''}</div>` : ''}
        ${history}
      </article>`;
    }).join('');
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

  function lookupSummary(rows) {
    if (!rows.length) return 'No matches found.';
    return `${rows.length} match${rows.length === 1 ? '' : 'es'} found.`;
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
    setLookupState('busy', 'Searching directory…');
    clearInterval(lookupTicker);
    lookupTicker = setInterval(() => {
      const seconds = Math.max(1, Math.floor((performance.now() - started) / 1000));
      setLookupState('busy', `Searching directory… ${seconds}s`);
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
      renderSearch(rows, response);
      setLookupState(rows.length ? 'good' : 'idle', lookupSummary(rows));
    } catch (error) {
      results.innerHTML = '<div class="empty error-box">Unable to complete lookup.</div>';
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

  function jumpToStation(target) {
    const query = String(target?.dataset?.stationQuery || '').trim();
    const label = String(target?.dataset?.stationLabel || query).trim();
    if (!query || lookupBusy) return;
    $('lookupInput').value = label || query;
    try { $('lookupPanel').scrollIntoView({behavior:'smooth', block:'start'}); } catch (_) {}
    void search(query);
  }

  function stationClick(event) {
    const target = event.target.closest('[data-station-query]');
    if (target) jumpToStation(target);
  }

  function applyObservedState(collapsed) {
    observedCollapsed = !!collapsed;
    $('observedPanel').classList.toggle('collapsed', observedCollapsed);
    $('observedBody').hidden = observedCollapsed;
    $('observedToggle').setAttribute('aria-expanded', String(!observedCollapsed));
    $('observedToggleLabel').textContent = observedCollapsed ? 'SHOW' : 'HIDE';
  }

  async function loadObservedState() {
    try {
      const stored = await window.ywdPlugin.getPreference('observed-collapsed');
      if (stored?.found) applyObservedState(stored.value === true);
      else applyObservedState(false);
    } catch (_) {
      applyObservedState(false);
    }
  }

  async function toggleObserved() {
    applyObservedState(!observedCollapsed);
    try { await window.ywdPlugin.setPreference('observed-collapsed', observedCollapsed); }
    catch (_) {}
  }

  $('lookupButton').addEventListener('click', runLookup);
  $('lookupInput').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    runLookup();
  });
  $('refreshButton').addEventListener('click', () => void refresh());
  $('observedToggle').addEventListener('click', () => void toggleObserved());
  $('currentActivity').addEventListener('click', stationClick);
  $('activityRows').addEventListener('click', stationClick);

  async function init() {
    try {
      await window.ywdPlugin.ready;
      const saved = await window.ywdPlugin.getConfig();
      config = {
        auto_refresh: saved?.auto_refresh !== false,
        refresh_seconds: number(saved?.refresh_seconds, 4, 2, 30),
        recent_limit: number(saved?.recent_limit, 15, 5, 30),
      };
      await loadObservedState();
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
