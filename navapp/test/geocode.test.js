const assert = require('assert');
const { createGeocoder } = require('../server/src/geocode');

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

module.exports = [
  {
    name: 'second identical search is served from cache, one upstream call',
    fn: async () => {
      const calls = [];
      const rows = [{ display_name: 'Harbour St, Perth', lat: '-31.95', lon: '115.86' }];
      const geo = createGeocoder({
        fetchImpl: fakeFetch(rows, calls),
        baseUrl: 'https://example.test',
        userAgent: 'navapp-test',
        sleep: async () => {},
      });
      await geo.search('Harbour St');
      const again = await geo.search('harbour st ');
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(again[0], { name: 'Harbour St, Perth', lat: -31.95, lng: 115.86 });
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
    name: 'viewbox bias is added to the upstream URL when configured',
    fn: async () => {
      const calls = [];
      const geo = createGeocoder({
        fetchImpl: fakeFetch([], calls),
        baseUrl: 'https://example.test',
        userAgent: 'navapp-test',
        viewbox: '115.6,-31.7,116.0,-32.2',
        sleep: async () => {},
      });
      await geo.search('Harbour St');
      assert.ok(calls[0].includes('&viewbox=115.6,-31.7,116.0,-32.2&'), calls[0]);
      assert.ok(!calls[0].includes('bounded'), calls[0]);
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
