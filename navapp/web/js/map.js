// Map screen: MapLibre map, search, one route, and turn-by-turn navigation.
// Navigation logic lives in nav.js and voice.js; this file wires them to GPS,
// the map and the on-screen panels, and decides when to reroute.
// Map colours and the route layers live in map-style.js.

// MapLibre takes [lng, lat]; the app's own positions are {lat, lng}.
const DEFAULT_CENTER = [115.86, -31.95];
const DEFAULT_ZOOM = 13;
const NAV_ZOOM = 17;
const NAV_PITCH = 45;
const REROUTE_MIN_GAP_MS = 10000;

const map = new maplibregl.Map({
  container: 'map',
  style: STYLE_URL,
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
map.on('load', () => {
  applyWazeLook(map);
  addRouteLayers(map);
  mapReady = true;
  if (pendingRoute) drawRoute(pendingRoute);
});
let mapReady = false;

const searchInput = document.getElementById('search');
const resultsList = document.getElementById('results');
const statusLine = document.getElementById('status');
const startBtn = document.getElementById('start');
const navBanner = document.getElementById('nav-banner');
const navDistance = document.getElementById('nav-distance');
const navStreet = document.getElementById('nav-street');
const navBottom = document.getElementById('nav-bottom');
const navEta = document.getElementById('nav-eta');
const navRemaining = document.getElementById('nav-remaining');
const endBtn = document.getElementById('end');

const voice = createVoice();
let youMarker = null;
let devicePosition = null;
let destination = null;
let pendingRoute = null;
// Named navigator_ so it does not shadow the browser's global navigator.
let navigator_ = null;
let lastRerouteAt = 0;
let navigating = false;

function setStatus(text) {
  statusLine.textContent = text || '';
}

function formatMetres(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
}

// Blue dot at rest, blue arrow while navigating. The map turns to face the
// direction of travel during navigation, so the arrow always points up.
function youElement() {
  const el = document.createElement('div');
  el.className = 'you';
  return el;
}

function showYou(pos) {
  devicePosition = { lat: pos.lat, lng: pos.lng };
  if (!youMarker) {
    youMarker = new maplibregl.Marker({ element: youElement(), rotationAlignment: 'map' })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map);
  } else {
    youMarker.setLngLat([pos.lng, pos.lat]);
  }
  youMarker.getElement().classList.toggle('navigating', navigating);
}

function onPosition(coords) {
  const pos = { lat: coords.latitude, lng: coords.longitude };
  showYou(pos);
  if (navigating) followNavigation(pos, coords.heading);
}

if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native');
}

const onLocationError = () => setStatus('Location unavailable. Search still works.');

// A GPS fix can take well over the plugin's default 10 seconds indoors, so the
// timeout is 30. The plugin also closes the watch after an error, so restart it.
const LOCATION_TIMEOUT_MS = 30000;
const RESTART_WATCH_MS = 5000;

// In the Android app, the Capacitor Geolocation plugin asks for the location
// permission and then reports fixes. In a normal browser, use the standard API.
const nativeGeo = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;

function startNativeWatch() {
  nativeGeo.watchPosition(
    { enableHighAccuracy: true, maximumAge: 2000, timeout: LOCATION_TIMEOUT_MS },
    (pos, err) => {
      if (err || !pos) {
        setStatus('Finding your location...');
        setTimeout(startNativeWatch, RESTART_WATCH_MS);
        return;
      }
      if (statusLine.textContent.startsWith('Finding your location')) setStatus('');
      onPosition(pos.coords);
    }
  );
}

async function startLocation() {
  if (nativeGeo) {
    await nativeGeo.requestPermissions();
    startNativeWatch();
    return;
  }
  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(
      (p) => onPosition(p.coords),
      onLocationError,
      { enableHighAccuracy: true, maximumAge: 2000, timeout: LOCATION_TIMEOUT_MS }
    );
  }
}

startLocation();

// Nearby places first, then a "Further away" heading and the rest of the world.
function renderResults({ nearby, further }) {
  resultsList.replaceChildren();
  const addHeading = (text) => {
    const li = document.createElement('li');
    li.className = 'group-heading';
    li.textContent = text;
    resultsList.appendChild(li);
  };
  const addPlace = (place) => {
    const li = document.createElement('li');
    li.textContent = place.name;
    li.addEventListener('click', () => chooseDestination(place));
    resultsList.appendChild(li);
  };
  if (nearby.length) {
    addHeading('Nearby');
    nearby.forEach(addPlace);
  }
  if (further.length) {
    addHeading('Further away');
    further.forEach(addPlace);
  }
  const total = nearby.length + further.length;
  resultsList.hidden = total === 0;
  if (total === 0) setStatus('No places found.');
}

async function runSearch(query) {
  if (!query.trim()) {
    resultsList.hidden = true;
    setStatus('');
    return;
  }
  setStatus('Searching...');
  try {
    renderResults(await searchPlaces(query, devicePosition));
    if (resultsList.hidden === false) setStatus('');
  } catch (err) {
    resultsList.hidden = true;
    setStatus(err.message);
  }
}

async function chooseDestination(place) {
  resultsList.hidden = true;
  searchInput.value = place.name;
  destination = place;
  if (!devicePosition) {
    setStatus('Waiting for your location before routing.');
    return;
  }
  setStatus('Finding a route...');
  try {
    pendingRoute = await fetchRoute(devicePosition, place);
    drawRoute(pendingRoute);
    const minutes = Math.round(pendingRoute.durationS / 60);
    setStatus(`${minutes} min · ${formatMetres(pendingRoute.distanceM)}`);
    startBtn.hidden = false;
  } catch (err) {
    startBtn.hidden = true;
    setStatus(err.message);
  }
}

function drawRoute(route) {
  if (!mapReady) return;
  setRouteGeometry(map, route.geometry);
  const lats = route.geometry.map((p) => p[0]);
  const lngs = route.geometry.map((p) => p[1]);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 60, duration: 0 }
  );
}

function startNavigation() {
  if (!pendingRoute || !devicePosition) return;
  navigator_ = createNavigator(pendingRoute);
  navigating = true;
  lastRerouteAt = Date.now();
  searchInput.hidden = true;
  resultsList.hidden = true;
  startBtn.hidden = true;
  statusLine.hidden = true;
  navBanner.hidden = false;
  navBottom.hidden = false;
  youMarker.getElement().classList.add('navigating');
  map.jumpTo({ center: [devicePosition.lng, devicePosition.lat], zoom: NAV_ZOOM, pitch: NAV_PITCH });
  followNavigation(devicePosition);
}

// Android Auto: the car screen reads the phone's navigation state through the
// NavState plugin. In a browser the plugin does not exist and this does nothing.
function carPlugin() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NavState;
}

function sendCarState(state) {
  const plugin = carPlugin();
  if (!plugin) return;
  plugin
    .update({ active: true, instruction: state.instruction, distanceM: Math.round(state.distanceToNextM) })
    .catch(() => {});
}

function clearCarState() {
  const plugin = carPlugin();
  if (!plugin) return;
  plugin.update({ active: false, instruction: '', distanceM: 0 }).catch(() => {});
}

function stopNavigation() {
  clearCarState();
  navigating = false;
  navigator_ = null;
  navBanner.hidden = true;
  navBottom.hidden = true;
  searchInput.hidden = false;
  statusLine.hidden = false;
  setStatus('');
  if (mapReady) clearRouteGeometry(map);
  pendingRoute = null;
  startBtn.hidden = true;
  youMarker.getElement().classList.remove('navigating');
  map.jumpTo({
    center: devicePosition ? [devicePosition.lng, devicePosition.lat] : DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: 0,
    bearing: 0,
  });
}

async function reroute() {
  if (!devicePosition || !destination) return;
  lastRerouteAt = Date.now();
  try {
    pendingRoute = await fetchRoute(devicePosition, destination);
    navigator_ = createNavigator(pendingRoute);
    drawRoute(pendingRoute);
    navStreet.textContent = 'Rerouting...';
  } catch (err) {
    navStreet.textContent = 'Off route. Reroute failed, still following old route.';
  }
}

function followNavigation(pos, heading) {
  if (!navigator_) return;
  const state = navigator_.update(pos);
  navDistance.textContent = formatMetres(state.distanceToNextM);
  navStreet.textContent = state.instruction;
  navRemaining.textContent = `${formatMetres(pendingRoute.distanceM)} route`;
  const etaMs = Date.now() + pendingRoute.durationS * 1000;
  navEta.textContent = new Date(etaMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  voice.onUpdate(state);
  sendCarState(state);
  // Heading-up: turn the map to the direction of travel when the phone reports one.
  const easeOptions = { center: [pos.lng, pos.lat], duration: 500 };
  if (Number.isFinite(heading)) easeOptions.bearing = heading;
  map.easeTo(easeOptions);
  if (state.arrived) {
    stopNavigation();
    setStatus('You have arrived.');
    return;
  }
  if (state.offRoute && Date.now() - lastRerouteAt >= REROUTE_MIN_GAP_MS) reroute();
}

startBtn.addEventListener('click', startNavigation);
endBtn.addEventListener('click', stopNavigation);

// Crowd reports. Markers and the live channel are in reports.js.
const reportSheet = document.getElementById('report-sheet');
const reportCard = document.getElementById('report-card');
const reportCardTitle = document.getElementById('report-card-title');
const reportCardCount = document.getElementById('report-card-count');
const voteConfirm = document.getElementById('vote-confirm');
const voteDismiss = document.getElementById('vote-dismiss');

function minutesAgo(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m === 0 ? 'just now' : `${m} min ago`;
}

function showReportCard(report) {
  if (!report) {
    reportCard.hidden = true;
    return;
  }
  reportCard.hidden = false;
  reportCardTitle.textContent = `${REPORT_TYPES[report.type].label}, ${minutesAgo(report.createdAt)}`;
  reportCardCount.textContent = `${report.confirms} still there · ${report.dismisses} gone`;
  voteConfirm.onclick = () => reports.vote(report.id, 'confirm').catch((err) => setStatus(err.message));
  voteDismiss.onclick = () => reports.vote(report.id, 'dismiss').catch((err) => setStatus(err.message));
}

const reports = createReports(map, { onSelect: showReportCard });

const typeGrid = document.getElementById('type-grid');
for (const [type, style] of Object.entries(REPORT_TYPES)) {
  const btn = document.createElement('button');
  btn.className = 'type-btn';
  btn.style.background = style.colour;
  btn.textContent = style.label;
  btn.addEventListener('click', () => postReport(type));
  typeGrid.appendChild(btn);
}

function postReport(type) {
  reportSheet.hidden = true;
  if (!devicePosition) {
    setStatus('Waiting for your location before reporting.');
    return;
  }
  reports
    .create(type, devicePosition)
    .then(() => setStatus('Report posted. Thanks!'))
    .catch((err) => setStatus(err.message));
}

document.getElementById('report-btn').addEventListener('click', () => {
  reportSheet.hidden = false;
});
document.getElementById('report-cancel').addEventListener('click', () => {
  reportSheet.hidden = true;
});

document.getElementById('recenter').addEventListener('click', () => {
  if (devicePosition) map.easeTo({ center: [devicePosition.lng, devicePosition.lat], duration: 500 });
});

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(searchInput.value), 350);
});
