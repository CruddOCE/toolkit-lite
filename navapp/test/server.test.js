const assert = require('assert');
const http = require('http');
const { createApp } = require('../server/index');

// Port 0 lets the OS pick a free port, so tests never collide with the dev server.
function startTestServer(deps) {
  return new Promise((resolve) => {
    const server = http.createServer(createApp(deps));
    server.listen(0, () => resolve(server));
  });
}

function get(server, path, headers = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http
      .get({ host: 'localhost', port, path, headers, agent: false }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }));
      })
      .on('error', reject);
  });
}

module.exports = [
  {
    name: 'API allows the Android app origin (http://localhost) and nothing else',
    fn: async () => {
      const server = await startTestServer({
        geocoder: { search: async () => [] },
        router: { getRoute: async () => ({}) },
      });
      try {
        const allowed = await get(server, '/api/geocode?q=x', { Origin: 'http://localhost' });
        assert.strictEqual(allowed.headers['access-control-allow-origin'], 'http://localhost');
        const other = await get(server, '/api/geocode?q=x', { Origin: 'http://evil.example' });
        assert.strictEqual(other.headers['access-control-allow-origin'], undefined);
      } finally {
        server.close();
      }
    },
  },
  {
    name: 'preflight from the app origin gets 204 with the allowed methods',
    fn: async () => {
      const server = await startTestServer({
        geocoder: { search: async () => [] },
        router: { getRoute: async () => ({}) },
      });
      try {
        const { port } = server.address();
        const status = await new Promise((resolve, reject) => {
          const req = http.request(
            { host: 'localhost', port, path: '/api/route', method: 'OPTIONS', headers: { Origin: 'http://localhost' }, agent: false },
            (res) => {
              assert.strictEqual(res.headers['access-control-allow-methods'], 'GET');
              res.resume();
              resolve(res.statusCode);
            }
          );
          req.on('error', reject);
          req.end();
        });
        assert.strictEqual(status, 204);
      } finally {
        server.close();
      }
    },
  },
  {
    name: '/api/route rejects non-numeric coordinates with 400',
    fn: async () => {
      const server = await startTestServer({
        geocoder: { search: async () => [] },
        router: { getRoute: async () => { throw new Error('should not be called'); } },
      });
      try {
        const r = await get(server, '/api/route?fromLat=abc&fromLng=1&toLat=2&toLng=2');
        assert.strictEqual(r.status, 400);
        assert.match(r.body.error, /required numbers/);
      } finally {
        server.close();
      }
    },
  },
  {
    name: '/api/geocode returns results from the geocoder',
    fn: async () => {
      const server = await startTestServer({
        geocoder: {
          search: async (q, near) => ({
            nearby: [{ name: `found ${q}`, lat: 1, lng: 2, near: near || null }],
            further: [],
          }),
        },
        router: { getRoute: async () => ({}) },
      });
      try {
        const r = await get(server, '/api/geocode?q=harbour&lat=-31.95&lng=115.86');
        assert.strictEqual(r.status, 200);
        assert.deepStrictEqual(r.body.nearby, [
          { name: 'found harbour', lat: 1, lng: 2, near: { lat: -31.95, lng: 115.86 } },
        ]);
        assert.deepStrictEqual(r.body.further, []);
      } finally {
        server.close();
      }
    },
  },
];
