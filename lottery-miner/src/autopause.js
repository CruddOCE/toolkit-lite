'use strict';

// Pauses mining while a stream or a game is running.
//
// This exists because of the dropped-frames history on this machine: a compute
// job saturating the card is exactly the kind of contention that shows up as
// dropped frames in OBS twenty minutes later and gets blamed on the ISP. The GPU
// stops completely, the CPU drops to a fraction of its threads, and the pool
// connection stays up throughout so nothing has to be restarted afterwards.

const { exec } = require('child_process');

const POLL_MS = 10000;

function listProcesses() {
  return new Promise(function (resolve) {
    // tasklist is far cheaper to spawn than a PowerShell Get-Process, and this
    // runs every ten seconds forever.
    exec('tasklist /FO CSV /NH', { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      function (err, stdout) {
        if (err) { resolve([]); return; }
        const names = [];
        const lines = stdout.split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          const match = /^"([^"]+)"/.exec(lines[i]);
          if (match) names.push(match[1].toLowerCase());
        }
        resolve(names);
      });
  });
}

function createAutopause(options) {
  let timer = null;
  let paused = false;
  let trigger = null;

  async function poll() {
    if (!options.processes.length) return;
    const running = await listProcesses();
    let found = null;
    for (let i = 0; i < options.processes.length; i += 1) {
      if (running.indexOf(options.processes[i]) !== -1) {
        found = options.processes[i];
        break;
      }
    }

    const shouldPause = Boolean(found);
    if (shouldPause !== paused) {
      paused = shouldPause;
      trigger = found;
      options.onChange(paused, found);
    }
  }

  function start() {
    if (!options.processes.length) {
      options.onLog('autopause disabled, no processes configured');
      return;
    }
    options.onLog('autopause watching for ' + options.processes.join(', '));
    poll();
    timer = setInterval(poll, POLL_MS);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    start: start,
    stop: stop,
    isPaused: function () { return paused; },
    getTrigger: function () { return trigger; },
  };
}

module.exports = { createAutopause, listProcesses };
