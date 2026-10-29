// Proxy for place search. The browser never calls Nominatim directly, because
// Nominatim's usage policy requires an identifying User-Agent and at most one
// request per second, and both are easy to break from many clients.
// The cache keeps repeated searches from using up that one-per-second budget.
//
// A search returns two lists. "nearby" holds places inside NEARBY_RADIUS_KM of
// the device. "further" holds everything else Nominatim finds anywhere in the
// world, so a typed city far away still shows up, just below the nearby ones.

const NEARBY_RADIUS_KM = 100;
const KM_PER_DEG_LAT = 111.2;

// Box around a point as Nominatim's viewbox: left,top,right,bottom (lng,lat).
function boundingBox(near, radiusKm) {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLng = radiusKm / (KM_PER_DEG_LAT * Math.cos((near.lat * Math.PI) / 180));
  return [
    (near.lng - dLng).toFixed(4),
    (near.lat + dLat).toFixed(4),
    (near.lng + dLng).toFixed(4),
    (near.lat - dLat).toFixed(4),
  ].join(',');
}

function createGeocoder(options) {
  const fetchImpl = options.fetchImpl;
  const baseUrl = options.baseUrl;
  const userAgent = options.userAgent;
  const minIntervalMs = options.minIntervalMs || 1000;
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const cache = new Map();
  let lastCallAt = -Infinity;

  // One upstream request, spaced at least minIntervalMs after the previous one.
  async function upstream(query, box) {
    const wait = lastCallAt + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastCallAt = now();

    const bounds = box ? `&viewbox=${box}&bounded=1` : '';
    const url = `${baseUrl}/search?format=jsonv2&limit=5${bounds}&q=${encodeURIComponent(query)}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
    if (!res.ok) throw new Error(`geocoder returned ${res.status}`);
    const rows = await res.json();
    return rows.map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
  }

  // near is optional: { lat, lng } of the device. Without it, everything is "further".
  async function search(query, near) {
    const text = String(query || '').trim().toLowerCase();
    if (!text) throw new Error('empty search');
    // Round the position so small GPS drift does not defeat the cache.
    const area = near ? `@${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : '';
    const key = text + area;
    if (cache.has(key)) return cache.get(key);

    let nearby = [];
    if (near) nearby = await upstream(text, boundingBox(near, NEARBY_RADIUS_KM));
    const everywhere = await upstream(text, null);
    const seen = new Set(nearby.map((p) => `${p.lat},${p.lng}`));
    const further = everywhere.filter((p) => !seen.has(`${p.lat},${p.lng}`));

    const result = { nearby, further };
    cache.set(key, result);
    return result;
  }

  return { search };
}

module.exports = { createGeocoder, boundingBox, NEARBY_RADIUS_KM };
