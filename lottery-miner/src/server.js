'use strict';

// Serves the dashboard, which is also the page that does the GPU hashing.
//
// ui-kit is mounted from the workspace rather than copied in, so a fix to the
// kit reaches this panel without anything being re-transcribed. That is the
// failure mode called out in the kit's own notes.

const path = require('path');
const express = require('express');

function createServer(options) {
  const app = express();

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/ui-kit', express.static(path.join(__dirname, '..', '..', 'ui-kit')));

  app.get('/api/stats', function (req, res) {
    res.json(options.getStats());
  });

  return app;
}

module.exports = { createServer };
