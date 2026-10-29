// Server entry point. Serves the web client and two JSON endpoints the client
// needs: /api/geocode (place search) and /api/route (routing). Upstream
// services are configured by env so a self-hosted OSRM or Nominatim can be
// swapped in later without code changes (plan: self-host before public release).

const path = require('path');
const express = require('express');
const { createGeocoder } = require('./src/geocode');
const { createRouter } = require('./src/routing');

function createApp(deps) {
  const app = express();
  const geocoder = deps.geocoder;
  const router = deps.router;

  app.use(express.static(path.join(__dirname, '..', 'web')));

  app.get('/api/geocode', async (req, res) => {
    try {
      const results = await geocoder.search(req.query.q);
      res.json({ results });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/route', async (req, res) => {
    const coords = ['fromLat', 'fromLng', 'toLat', 'toLng'].map((k) => Number(req.query[k]));
    if (coords.some((n) => !Number.isFinite(n))) {
      res.status(400).json({ error: 'fromLat, fromLng, toLat and toLng are required numbers' });
      return;
    }
    try {
      const route = await router.getRoute({
        from: { lat: coords[0], lng: coords[1] },
        to: { lat: coords[2], lng: coords[3] },
      });
      res.json(route);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return app;
}

function defaultDeps() {
  return {
    geocoder: createGeocoder({
      fetchImpl: fetch,
      baseUrl: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
      userAgent: process.env.USER_AGENT || 'navapp/dev (placeholder contact)',
      // left,top,right,bottom as lng,lat pairs. Default is a Perth WA bias for now;
      // set NAV_VIEWBOX to change it or leave it empty to remove the bias.
      viewbox: process.env.NAV_VIEWBOX === undefined ? '115.6,-31.7,116.0,-32.2' : process.env.NAV_VIEWBOX,
    }),
    router: createRouter({
      fetchImpl: fetch,
      baseUrl: process.env.OSRM_URL || 'https://router.project-osrm.org',
    }),
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8090;
  createApp(defaultDeps()).listen(port, () => {
    console.log(`navapp listening on http://localhost:${port}`);
  });
}

module.exports = { createApp };
