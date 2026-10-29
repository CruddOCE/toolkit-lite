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

function get(server, path) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http
      .get({ host: 'localhost', port, path, agent: false }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      })
      .on('error', reject);
  });
}

module.exports = [
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
          search: async (q) => [{ name: `found ${q}`, lat: 1, lng: 2 }],
        },
        router: { getRoute: async () => ({}) },
      });
      try {
        const r = await get(server, '/api/geocode?q=harbour');
        assert.strictEqual(r.status, 200);
        assert.deepStrictEqual(r.body.results, [{ name: 'found harbour', lat: 1, lng: 2 }]);
      } finally {
        server.close();
      }
    },
  },
];
