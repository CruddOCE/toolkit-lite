const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createRouter, parseOsrmResponse } = require('../server/src/routing');

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'osrm-route.json'), 'utf8')
);

function fixtureFetch(body, status = 200, seen = []) {
  return async (url) => {
    seen.push(url);
    return { ok: status === 200, status, json: async () => body };
  };
}

module.exports = [
  {
    name: 'parses distance, duration and swaps OSRM [lng, lat] into {lat, lng} steps',
    fn: async () => {
      const route = parseOsrmResponse(fixture);
      assert.strictEqual(route.distanceM, 1240.5);
      assert.strictEqual(route.durationS, 210.3);
      assert.deepStrictEqual(route.geometry[0], [-31.9505, 115.8575]);
      assert.deepStrictEqual(route.steps[1].location, { lat: -31.951, lng: 115.8601 });
    },
  },
  {
    name: 'builds readable instructions for depart, turn and arrive',
    fn: async () => {
      const steps = parseOsrmResponse(fixture).steps;
      assert.strictEqual(steps[0].instruction, 'Head left Mounts Bay Rd');
      assert.strictEqual(steps[1].instruction, 'Turn right onto Harbour St');
      assert.strictEqual(steps[2].instruction, 'You have arrived');
    },
  },
  {
    name: 'no route from OSRM throws a clear error, not a crash',
    fn: async () => {
      assert.throws(
        () => parseOsrmResponse({ code: 'NoRoute', routes: [] }),
        /no route found \(NoRoute\)/
      );
    },
  },
  {
    name: 'getRoute builds the OSRM URL with lng,lat order',
    fn: async () => {
      const seen = [];
      const router = createRouter({
        fetchImpl: fixtureFetch(fixture, 200, seen),
        baseUrl: 'https://osrm.test',
      });
      await router.getRoute({
        from: { lat: -31.9505, lng: 115.8575 },
        to: { lat: -31.9535, lng: 115.8602 },
      });
      assert.ok(
        seen[0].startsWith('https://osrm.test/route/v1/driving/115.8575,-31.9505;115.8602,-31.9535?'),
        seen[0]
      );
    },
  },
  {
    name: 'same start and destination is rejected before any upstream call',
    fn: async () => {
      const seen = [];
      const router = createRouter({
        fetchImpl: fixtureFetch(fixture, 200, seen),
        baseUrl: 'https://osrm.test',
      });
      const p = { lat: -31.95, lng: 115.86 };
      await assert.rejects(() => router.getRoute({ from: p, to: p }), /same/);
      assert.strictEqual(seen.length, 0);
    },
  },
  {
    name: 'non-200 from the routing service throws',
    fn: async () => {
      const router = createRouter({
        fetchImpl: fixtureFetch({}, 503),
        baseUrl: 'https://osrm.test',
      });
      await assert.rejects(
        () => router.getRoute({ from: { lat: 1, lng: 1 }, to: { lat: 2, lng: 2 } }),
        /returned 503/
      );
    },
  },
];
