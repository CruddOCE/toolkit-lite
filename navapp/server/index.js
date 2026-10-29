// Server entry point. Serves the web client and the JSON endpoints it needs:
// /api/geocode (place search), /api/route (routing) and /api/reports (crowd
// reports). Upstream services are configured by env so a self-hosted OSRM or
// Nominatim can be swapped in later without code changes (plan: self-host
// before public release). Live report updates go over WebSocket at /live.

const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { createGeocoder } = require('./src/geocode');
const { createRouter } = require('./src/routing');
const { createReportStore } = require('./src/reports');
const { attachLive } = require('./src/live');

// The Android app loads its pages from http://localhost (Capacitor's http scheme,
// set in capacitor.config.json) but calls this server by its LAN address, so the
// browser treats those calls as cross-origin. Only that origin is allowed. A
// wildcard would let any web page on the network call the API.
const ALLOWED_ORIGINS = ['http://localhost'];

function apiCors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
    return;
  }
  next();
}

function createApp(deps) {
  const app = express();
  const geocoder = deps.geocoder;
  const router = deps.router;
  const reports = deps.reports;
  // Looked up on each write, because main() attaches the live channel after the app exists.
  const notify = (report) => {
    if (deps.notify) deps.notify(report);
  };

  app.use('/api', apiCors);
  app.use('/api', express.json({ limit: '1kb' }));
  app.use(express.static(path.join(__dirname, '..', 'web')));

  app.get('/api/geocode', async (req, res) => {
    // Optional device position. Without it every result is "further".
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const near = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
    try {
      const { nearby, further } = await geocoder.search(req.query.q, near);
      res.json({ nearby, further });
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

  // Reports. Each write goes to the live channel so other phones update at once.
  function needReports(res) {
    if (!reports) {
      res.status(503).json({ error: 'reports are not configured' });
      return false;
    }
    return true;
  }

  app.get('/api/reports', (req, res) => {
    if (!needReports(res)) return;
    const box = ['south', 'west', 'north', 'east'].map((k) => Number(req.query[k]));
    if (box.some((n) => !Number.isFinite(n))) {
      res.status(400).json({ error: 'south, west, north and east are required numbers' });
      return;
    }
    const [south, west, north, east] = box;
    res.json({ reports: reports.inBounds({ south, west, north, east }) });
  });

  app.post('/api/reports', (req, res) => {
    if (!needReports(res)) return;
    try {
      const report = reports.create({ ...req.body, reporterId: req.body && req.body.reporterId });
      notify(report);
      res.status(201).json({ report });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  for (const action of ['confirm', 'dismiss']) {
    app.post(`/api/reports/:id/${action}`, (req, res) => {
      if (!needReports(res)) return;
      try {
        const report = reports[action](Number(req.params.id), req.body && req.body.reporterId);
        notify(report);
        res.json({ report });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });
  }

  return app;
}

function defaultDeps() {
  const dbFile = process.env.REPORTS_DB || path.join(__dirname, '..', 'data', 'reports.db');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  return {
    geocoder: createGeocoder({
      fetchImpl: fetch,
      baseUrl: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
      userAgent: process.env.USER_AGENT || 'navapp/dev (placeholder contact)',
    }),
    router: createRouter({
      fetchImpl: fetch,
      baseUrl: process.env.OSRM_URL || 'https://router.project-osrm.org',
    }),
    reports: createReportStore({ path: dbFile }),
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8090;
  const deps = defaultDeps();
  const server = http.createServer(createApp(deps));
  const live = attachLive(server);
  deps.notify = live.broadcast;
  server.listen(port, () => {
    console.log(`navapp listening on http://localhost:${port}`);
  });
}

module.exports = { createApp };
