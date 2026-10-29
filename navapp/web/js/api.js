// Thin fetch wrappers for the server's two endpoints. Every network failure
// becomes a thrown Error with a message the UI can show, so map.js never
// has to read raw responses.

const API_BASE = window.NAV_API_BASE || '';

async function getJson(url) {
  const res = await fetch(API_BASE + url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
}

function searchPlaces(query) {
  return getJson(`/api/geocode?q=${encodeURIComponent(query)}`).then((b) => b.results);
}

function fetchRoute(from, to) {
  const qs = new URLSearchParams({
    fromLat: from.lat,
    fromLng: from.lng,
    toLat: to.lat,
    toLng: to.lng,
  });
  return getJson(`/api/route?${qs}`);
}
