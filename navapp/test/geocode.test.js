const assert = require('assert');
const { createGeocoder, boundingBox, NEARBY_RADIUS_KM } = require('../server/src/geocode');

// Returns the same rows for every call, and records each URL asked for.
function fakeFetch(rows, calls) {
  return async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => rows,
    };
  };
}

const PERTH = { lat: -31.95, lng: 115.86 };

module.exports = [
  {
    name: 'radius is 100 km and the box spans about 100 km each way from the device',
    fn: async () => {
      assert.strictEqual(NEARBY_RADIUS_KM, 100);
      const box = boundingBox(PERTH, 100).split(',').map(Number);
      const [left, top, right, bottom] = box;
      // 100 km is about 0.9 degrees of latitude; longitude depends on latitude.
      assert.ok(Math.abs(top - PERTH.lat - 0.9) < 0.02, `top ${top}`);
      assert.ok(Math.abs(PERTH.lat - bottom - 0.9) < 0.02, `bottom ${bottom}`);
      assert.ok(right > left);
    },
  },
  {
    name: 'with a device position, the nearby search is bounded to the box and the global search is not',
    fn: async () => {
      const calls = [];
      const geo = createGeocoder({
        fetchImpl: fakeFetch([], calls),
        baseUrl: 'https://example.test',
        userAgent: 'navapp-test',
        sleep: async () => {},
      });
      await geo.search('Harbour St', PERTH);
      assert.strictEqual(calls.length, 2);
      assert.ok(calls[0].includes('&bounded=1'), calls[0]);
      assert.ok(!calls[1].includes('bounded'), calls[1]);
    },
  },
  {
    name: 'a place inside the radius is in nearby; one outside it is in further',
    fn: async () => {
      const inside = { display_name: 'Harbour St, Perth', lat: '-31.955', lon: '115.86' };
      const outside = { display_name: 'Harbour Street, Ottawa', lat: '45.45', lon: '-76.2' };
      // Nominatim returns both to the global search, but only the bounded search
      // returns the nearby one. Serve each call the rows it would really return.
      const geo = createGeocoder({
        fetchImpl: async (url) => ({
          ok: true,
          status: 200,
          json: async () => (url.includes('bounded=1') ? [inside] : [inside, outside]),
        }),
        baseUrl: 'https://example.test',
        userAgent: 'navapp-test',
        sleep: async () => {},
      });
      const r = await geo.search('harbour', PERTH);
      assert.deepStrictEqual(r.nearby, [{ name: 'Harbour St, Perth', lat: -31.955, lng: 115.86 }]);
      assert.deepStrictEqual(r.further, [{ name: 'Harbour Street, Ottawa', lat: 45.45, lng: -76.2 }]);
    },
  },
  {
    name: 'without a device position, nothing is nearby and results go to further',
    fn: async () => {
      const geo = createGeocoder({
        fetchImpl: fakeFetch([{ display_name: 'Ottawa', lat: '45.4', lon: '-75.7' }], []),
        baseUrl: 'https://example.test',
        userAgent: 'navapp-test',
        sleep: async () => {},
      });
      const r = await geo.search('Ottawa');
      assert.deepStrictEqual(r.nearby, []);
      assert.strictEqual(r.further.length, 1);
    },
  },
  {
    name: 'second identical search from the same area is served from cache',
    fn: async () => {
      const calls = [];
      const geo = createGeocoder({
        fetchImpl: fakeFetch([{ display_name: 'Harbour St, Perth', lat: '-31.95', lon: '115.86' }], calls),
        baseUrl: 'https://example.test',
        userAgent: 'navapp-test',
        sleep: async () => {},
      });
      await geo.search('Harbour St', PERTH);
      const callsAfterFirst = calls.length;
      await geo.search('harbour st ', PERTH);
      assert.strictEqual(calls.length, callsAfterFirst);
    },
  },
  {
    name: 'the same query from a different area is not served from the other area cache',
    fn: async () => {
      const calls = [];
      const geo = createGeocoder({
        fetchImpl: fakeFetch([], calls),
        baseUrl: 'https://example.test',
        userAgent: 'navapp-test',
        sleep: async () => {},
      });
      await geo.search('Harbour St', PERTH);
      const before = calls.length;
      await geo.search('Harbour St', { lat: 45.4, lng: -75.7 });
      assert.ok(calls.length > before);
    },
  },
  {
    name: 'consecutive upstream calls are at least minIntervalMs apart',
    fn: async () => {
      let clock = 0;
      const waits = [];
      const geo = createGeocoder({
        fetchImpl: fakeFetch([], []),
        baseUrl: 'https://example.test',
        userAgent: 'navapp-test',
        minIntervalMs: 1000,
        now: () => clock,
        sleep: async (ms) => {
          waits.push(ms);
          clock += ms;
        },
      });
      await geo.search('a');
      await geo.search('b');
      assert.deepStrictEqual(waits, [1000]);
    },
  },
  {
    name: 'sends the identifying User-Agent header',
    fn: async () => {
      let seenHeaders = null;
      const geo = createGeocoder({
        fetchImpl: async (url, opts) => {
          seenHeaders = opts.headers;
          return { ok: true, status: 200, json: async () => [] };
        },
        baseUrl: 'https://example.test',
        userAgent: 'navapp/dev (contact: placeholder)',
        sleep: async () => {},
      });
      await geo.search('x');
      assert.strictEqual(seenHeaders['User-Agent'], 'navapp/dev (contact: placeholder)');
    },
  },
  {
    name: 'empty query is rejected before any upstream call',
    fn: async () => {
      const calls = [];
      const geo = createGeocoder({
        fetchImpl: fakeFetch([], calls),
        baseUrl: 'https://example.test',
        userAgent: 'navapp-test',
        sleep: async () => {},
      });
      await assert.rejects(() => geo.search('   '), /empty search/);
      assert.strictEqual(calls.length, 0);
    },
  },
];
