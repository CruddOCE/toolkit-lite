const assert = require('assert');
const { createReportStore, RATE_MAX, TTL_MS, HIDE_AFTER_DISMISSES } = require('../server/src/reports');

// A store with an in-memory database and a clock the test controls.
function newStore() {
  let clock = 1_000_000;
  const store = createReportStore({ path: ':memory:', now: () => clock });
  return {
    store,
    advance: (ms) => (clock += ms),
    setClock: (t) => (clock = t),
  };
}

const DEVICE_A = 'device-aaaaaaaa';
const DEVICE_B = 'device-bbbbbbbb';
const DEVICE_C = 'device-cccccccc';
const DEVICE_D = 'device-dddddddd';
const PERTH = { lat: -31.95, lng: 115.86 };

module.exports = [
  {
    name: 'create stores a report with an expiry 30 minutes out',
    fn: async () => {
      const { store } = newStore();
      const r = store.create({ type: 'crash', ...PERTH, reporterId: DEVICE_A });
      assert.strictEqual(r.type, 'crash');
      assert.strictEqual(r.expiresAt - r.createdAt, TTL_MS);
      assert.strictEqual(r.confirms, 0);
      assert.strictEqual(r.dismisses, 0);
    },
  },
  {
    name: 'unknown report type is rejected',
    fn: async () => {
      const { store } = newStore();
      assert.throws(() => store.create({ type: 'ufo', ...PERTH, reporterId: DEVICE_A }), /type must be one of/);
    },
  },
  {
    name: 'a device can post at most RATE_MAX reports in the window',
    fn: async () => {
      const { store } = newStore();
      for (let i = 0; i < RATE_MAX; i += 1) store.create({ type: 'jam', ...PERTH, reporterId: DEVICE_A });
      assert.throws(() => store.create({ type: 'jam', ...PERTH, reporterId: DEVICE_A }), /too many reports/);
      // Another device is not affected.
      store.create({ type: 'jam', ...PERTH, reporterId: DEVICE_B });
    },
  },
  {
    name: 'the post limit resets once the window has passed',
    fn: async () => {
      const { store, advance } = newStore();
      for (let i = 0; i < RATE_MAX; i += 1) store.create({ type: 'jam', ...PERTH, reporterId: DEVICE_A });
      advance(10 * 60 * 1000 + 1);
      store.create({ type: 'jam', ...PERTH, reporterId: DEVICE_A });
    },
  },
  {
    name: 'a device can confirm a report once only',
    fn: async () => {
      const { store } = newStore();
      const r = store.create({ type: 'police', ...PERTH, reporterId: DEVICE_A });
      assert.strictEqual(store.confirm(r.id, DEVICE_B).confirms, 1);
      assert.throws(() => store.confirm(r.id, DEVICE_B), /already voted/);
    },
  },
  {
    name: 'a report with enough dismissals is hidden from the map',
    fn: async () => {
      const { store } = newStore();
      const r = store.create({ type: 'hazard', ...PERTH, reporterId: DEVICE_A });
      const box = { south: -32, north: -31, west: 115, east: 117 };
      assert.strictEqual(store.inBounds(box).length, 1);
      let report;
      for (let i = 0; i < HIDE_AFTER_DISMISSES; i += 1) {
        report = store.dismiss(r.id, [DEVICE_B, DEVICE_C, DEVICE_D][i]);
      }
      assert.strictEqual(report.dismisses, HIDE_AFTER_DISMISSES);
      assert.strictEqual(store.inBounds(box).length, 0);
    },
  },
  {
    name: 'inBounds returns only reports inside the box',
    fn: async () => {
      const { store } = newStore();
      store.create({ type: 'crash', ...PERTH, reporterId: DEVICE_A });
      store.create({ type: 'crash', lat: 45.4, lng: -75.7, reporterId: DEVICE_B });
      const perth = store.inBounds({ south: -32, north: -31, west: 115, east: 117 });
      assert.strictEqual(perth.length, 1);
      assert.strictEqual(perth[0].lat, -31.95);
    },
  },
  {
    name: 'expired reports are not listed and expire() removes them',
    fn: async () => {
      const { store, advance } = newStore();
      store.create({ type: 'closed', ...PERTH, reporterId: DEVICE_A });
      advance(TTL_MS + 1);
      assert.strictEqual(store.inBounds({ south: -32, north: -31, west: 115, east: 117 }).length, 0);
      assert.strictEqual(store.expire(), 1);
    },
  },
  {
    name: 'confirming an expired or unknown report is refused',
    fn: async () => {
      const { store, advance } = newStore();
      const r = store.create({ type: 'closed', ...PERTH, reporterId: DEVICE_A });
      advance(TTL_MS + 1);
      assert.throws(() => store.confirm(r.id, DEVICE_B), /not found/);
      assert.throws(() => store.confirm(999, DEVICE_B), /not found/);
    },
  },
  {
    name: 'a device id that is missing or too short is rejected',
    fn: async () => {
      const { store } = newStore();
      assert.throws(() => store.create({ type: 'jam', ...PERTH, reporterId: 'x' }), /device id is required/);
    },
  },
];
