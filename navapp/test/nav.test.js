const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createNavigator, distanceM, distanceToRouteM } = require('../web/js/nav');

const trace = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'gps-trace.json'), 'utf8')
);

module.exports = [
  {
    name: 'distanceM is about 111 m per 0.001 deg of latitude',
    fn: async () => {
      const d = distanceM({ lat: -31.95, lng: 115.86 }, { lat: -31.951, lng: 115.86 });
      assert.ok(Math.abs(d - 111.2) < 0.5, `got ${d}`);
    },
  },
  {
    name: 'a fix midway between two route vertices is on route (segment distance, not vertex)',
    fn: async () => {
      const d = distanceToRouteM({ lat: -31.9505, lng: 115.86 }, trace.route.geometry);
      assert.ok(d < 1, `got ${d}`);
    },
  },
  {
    name: 'replaying the recorded trace: step advance, off-route after 3 fixes, arrival',
    fn: async () => {
      const nav = createNavigator(trace.route);
      const out = trace.fixes.map((f) => nav.update(f));

      // Fix 1 is 55 m past the start point, so the depart step is skipped.
      // The prompt is now the turn, about 500 m ahead.
      assert.strictEqual(out[0].stepIndex, 1);
      assert.strictEqual(out[0].instruction, 'Turn right onto Mill St');
      assert.ok(out[0].distanceToNextM > 400, `got ${out[0].distanceToNextM}`);

      // Fix 4 is inside 25 m of the turn: prompt moves to the arrival step.
      assert.strictEqual(out[3].stepIndex, 2);
      assert.strictEqual(out[3].instruction, 'You have arrived');

      // Fixes 5 and 6 are off route; fix 7 is the third in a row.
      assert.strictEqual(out[4].offRoute, false);
      assert.strictEqual(out[5].offRoute, false);
      assert.strictEqual(out[6].offRoute, true);

      // Fix 8 is back on the line at the destination.
      assert.strictEqual(out[7].offRoute, false);
      assert.strictEqual(out[7].arrived, true);
      assert.strictEqual(out[7].distanceToNextM, 0);
    },
  },
  {
    name: 'a single off-route fix does not set offRoute',
    fn: async () => {
      const nav = createNavigator(trace.route);
      const r = nav.update({ lat: -31.9540, lng: 115.8615 });
      assert.strictEqual(r.offRoute, false);
    },
  },
  {
    name: 'route with no steps is rejected',
    fn: async () => {
      assert.throws(() => createNavigator({ steps: [], geometry: [] }), /needs a route with steps/);
    },
  },
];
