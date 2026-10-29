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

// near is the device position ({lat, lng}) or null. Resolves to { nearby, further }.
function searchPlaces(query, near) {
  const qs = new URLSearchParams({ q: query });
  if (near) {
    qs.set('lat', near.lat);
    qs.set('lng', near.lng);
  }
  return getJson(`/api/geocode?${qs}`);
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
