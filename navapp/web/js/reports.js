// Crowd reports on the map: post one from the road, see others' reports as
// markers, and confirm or dismiss them. Loads the reports in view on each map
// move and keeps one WebSocket open for live changes. The map itself is
// created in map.js and passed in, so this file has no map setup of its own.

const REPORT_TYPES = {
  police: { label: 'Police', colour: '#3b6fd6', glyph: 'P' },
  crash: { label: 'Crash', colour: '#e04a3f', glyph: '!' },
  hazard: { label: 'Hazard', colour: '#f2a900', glyph: 'H' },
  jam: { label: 'Traffic jam', colour: '#f07a1d', glyph: 'J' },
  closed: { label: 'Road closed', colour: '#5f6b78', glyph: 'X' },
};

// One random id per install, kept in localStorage. The server only uses it to
// stop one device voting twice and to rate limit posts. It is not an account.
function deviceId() {
  try {
    let id = localStorage.getItem('navapp-device-id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '');
      localStorage.setItem('navapp-device-id', id);
    }
    return id;
  } catch (err) {
    // Private browsing or blocked storage: an id for this session only.
    return `session-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function wsBase() {
  const base = window.NAV_API_BASE || window.location.origin;
  return base.replace(/^http/, 'ws');
}

function markerElement(report) {
  const style = REPORT_TYPES[report.type];
  const el = document.createElement('button');
  el.className = 'report-pin';
  el.style.background = style.colour;
  el.textContent = style.glyph;
  el.setAttribute('aria-label', style.label);
  return el;
}

function createReports(map, options) {
  const markers = new Map();
  let selectedId = null;

  function upsert(report) {
    const existing = markers.get(report.id);
    if (existing) existing.marker.remove();
    if (report.dismisses >= 2 || report.expiresAt <= Date.now()) {
      markers.delete(report.id);
      if (selectedId === report.id) options.onSelect(null);
      return;
    }
    const el = markerElement(report);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedId = report.id;
      options.onSelect(report);
    });
    const marker = new maplibregl.Marker({ element: el }).setLngLat([report.lng, report.lat]).addTo(map);
    markers.set(report.id, { report, marker });
    if (selectedId === report.id) options.onSelect(report);
  }

  async function loadInView() {
    const b = map.getBounds();
    const qs = new URLSearchParams({
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    });
    try {
      const res = await fetch(`${window.NAV_API_BASE || ''}/api/reports?${qs}`);
      if (!res.ok) return;
      const { reports } = await res.json();
      for (const r of reports) upsert(r);
    } catch (err) {
      // Offline: keep whatever is already on the map.
    }
  }

  async function post(path, body) {
    const res = await fetch(`${window.NAV_API_BASE || ''}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
    return data.report;
  }

  function create(type, position) {
    return post('/api/reports', { type, lat: position.lat, lng: position.lng, reporterId: deviceId() }).then(
      (report) => {
        upsert(report);
        return report;
      }
    );
  }

  function vote(id, kind) {
    return post(`/api/reports/${id}/${kind}`, { reporterId: deviceId() }).then((report) => {
      upsert(report);
      return report;
    });
  }

  // Live updates. If the connection drops, retry in 5 seconds.
  function connectLive() {
    const socket = new WebSocket(`${wsBase()}/live`);
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'report') upsert(msg.report);
    });
    socket.addEventListener('close', () => setTimeout(connectLive, 5000));
  }

  map.on('moveend', loadInView);
  loadInView();
  connectLive();

  return { create, vote, loadInView, REPORT_TYPES };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { REPORT_TYPES, deviceId, wsBase };
}
