// Proxy for place search. The browser never calls Nominatim directly, because
// Nominatim's usage policy requires an identifying User-Agent and at most one
// request per second, and both are easy to break from many clients.
// The cache keeps repeated searches from using up that one-per-second budget.

function createGeocoder(options) {
  const fetchImpl = options.fetchImpl;
  const baseUrl = options.baseUrl;
  const userAgent = options.userAgent;
  const minIntervalMs = options.minIntervalMs || 1000;
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const cache = new Map();
  let lastCallAt = -Infinity;

  async function search(query) {
    const key = String(query || '').trim().toLowerCase();
    if (!key) throw new Error('empty search');
    if (cache.has(key)) return cache.get(key);

    const wait = lastCallAt + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastCallAt = now();

    // viewbox biases results toward the area the app is used in without hiding
    // places outside it (bounded is left at 0), so "Harbour St" finds Perth first.
    const viewbox = options.viewbox ? `&viewbox=${options.viewbox}` : '';
    const url = `${baseUrl}/search?format=jsonv2&limit=5${viewbox}&q=${encodeURIComponent(key)}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
    if (!res.ok) throw new Error(`geocoder returned ${res.status}`);
    const rows = await res.json();
    const results = rows.map((r) => ({
      name: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
    cache.set(key, results);
    return results;
  }

  return { search };
}

module.exports = { createGeocoder };
