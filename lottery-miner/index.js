'use strict';

// Entry point. Wires the pool connection, the CPU threads, the GPU bridge and
// the dashboard together, and owns the shutdown path.
//
// Shutdown matters more than usual here: worker threads that outlive the parent
// are the local flavour of the orphaned-node-process problem, and they are
// invisible except as a machine that never goes quiet.

const http = require('http');
const os = require('os');
const path = require('path');

// Anchored to the file, not the working directory, so the miner can be launched
// from the workspace root as easily as from its own folder.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const job = require('./src/job');
const { loadConfig } = require('./src/config');
const { createClient } = require('./src/stratum');
const { createDispenser } = require('./src/work');
const { createCpuPool } = require('./src/cpu-pool');
const { createBridge } = require('./src/gpu-bridge');
const { createAutopause } = require('./src/autopause');
const { createStats } = require('./src/stats');
const { createServer } = require('./src/server');

const logLines = [];

function log(message) {
  const line = new Date().toISOString().slice(11, 19) + '  ' + message;
  logLines.push(line);
  if (logLines.length > 200) logLines.shift();
  console.log(line);
  if (bridge) bridge.broadcast({ type: 'log', line: line });
}

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error('\nConfiguration error: ' + err.message + '\n');
  process.exit(1);
}

const stats = createStats();
const dispenser = createDispenser();
let bridge = null;
let poolConnected = false;
let currentJobId = null;

const pool = createClient({
  host: config.poolHost,
  port: config.poolPort,
  address: config.address,
  workerName: config.workerName,
  suggestDifficulty: config.suggestDifficulty,
});

// A hit is re-hashed here before submission. The GPU path in particular runs in
// a browser, so a nonce arriving over the socket is a claim, not a fact.
async function handleHit(unit, nonce) {
  const result = dispenser.verifyHit(unit, nonce);
  if (!result) return;

  if (!result.meetsShare) {
    // Stale generation or a miscomputed hash. Worth logging, since a steady
    // stream of these means something is wrong rather than unlucky.
    log('discarded a hit that did not verify (nonce ' + nonce + ')');
    return;
  }

  if (result.meetsNetwork) {
    stats.recordBlock();
    log('');
    log('*** BLOCK FOUND: ' + result.displayHash + ' ***');
    log('*** submitting to ' + config.poolHost + ' ***');
    log('');
  }

  try {
    const accepted = await pool.submit({
      jobId: unit.jobId,
      extranonce2Hex: unit.extranonce2Hex,
      ntime: unit.ntime,
      nonce: nonce,
    });
    stats.recordShare(accepted === true, result.shareDifficulty, result.displayHash);
    log(
      (accepted === true ? 'share accepted' : 'share rejected') +
        ' at difficulty ' + result.shareDifficulty.toFixed(3)
    );
  } catch (err) {
    stats.recordShare(false, result.shareDifficulty, result.displayHash);
    log('submit failed: ' + err.message);
  }
}

const cpuPool = createCpuPool({
  nextUnit: function () { return dispenser.nextUnit(); },
  onRate: function (hashes, ms) { stats.recordCpu(hashes, ms); },
  onHit: handleHit,
  onLog: log,
});

bridge = createBridge({
  nextUnit: function () { return dispenser.nextUnit(); },
  onRate: function (hashes, ms) { stats.recordGpu(hashes, ms); },
  onHit: handleHit,
  onLog: log,
});

const autopause = createAutopause({
  processes: config.autopauseProcesses,
  onLog: log,
  onChange: function (paused, trigger) {
    if (paused) log('pausing: ' + trigger + ' is running');
    else log('resuming, watched processes have exited');
    bridge.setPaused(paused);
    cpuPool.setPaused(paused, config.pausedCpuFraction);
  },
});

pool.on('log', log);

pool.on('connected', function () { poolConnected = true; });
pool.on('disconnected', function () { poolConnected = false; });

pool.on('difficulty', function (difficulty) {
  log('pool difficulty set to ' + difficulty);
});

pool.on('job', function (notify) {
  const isNew = notify.jobId !== currentJobId;
  currentJobId = notify.jobId;
  dispenser.setJob(notify);
  if (isNew) log('job ' + notify.jobId + (notify.cleanJobs ? ' (clean)' : ''));
  cpuPool.refresh();
  bridge.refresh();
});

function getStats() {
  // Network difficulty is derived from the nbits of whatever job is loaded, so
  // it needs no second source and cannot drift from what is being mined.
  const current = dispenser.getCurrent();
  const networkDifficulty = current
    ? Number((job.DIFF1_TARGET * 1000n) / current.networkTarget) / 1000
    : null;

  return stats.snapshot({
    networkDifficulty: networkDifficulty,
    poolConnected: poolConnected,
    poolHost: config.poolHost + ':' + config.poolPort,
    address: config.address,
    workerName: config.workerName,
    jobId: currentJobId,
    difficulty: pool.getDifficulty(),
    cpuThreads: cpuPool.getThreadCount(),
    cpuActive: cpuPool.getActiveCount(),
    gpuMiners: bridge.getMinerCount(),
    gpuAdapter: bridge.getAdapter(),
    gpuEnabled: config.gpuEnabled,
    paused: autopause.isPaused(),
    pauseTrigger: autopause.getTrigger(),
    cpuModel: os.cpus()[0] ? os.cpus()[0].model.trim() : 'unknown',
    log: logLines.slice(-60),
  });
}

const app = createServer({ getStats: getStats });
const server = http.createServer(app);
bridge.start(server);

// Nothing starts hashing until the port is actually held. Spawning eleven
// worker threads and then dying on EADDRINUSE is how you end up hunting orphans.
server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(
      '\nPort ' + config.httpPort + ' is already in use. Set HTTP_PORT in .env ' +
        'to a free port and start again.\n'
    );
  } else {
    console.error('\nServer error: ' + err.message + '\n');
  }
  process.exit(1);
});

server.listen(config.httpPort, function () {
  log('dashboard on http://localhost:' + config.httpPort);
  if (config.gpuEnabled) {
    log('open that page to start GPU hashing, the CPU runs without it');
  }

  setInterval(function () {
    bridge.broadcast({ type: 'stats', stats: getStats() });
  }, 1000).unref();

  if (config.cpuThreads > 0) cpuPool.start(config.cpuThreads);
  else log('cpu hashing disabled by config');

  autopause.start();
  pool.start();
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down');
  autopause.stop();
  pool.stop();
  cpuPool.stop();
  server.close();
  setTimeout(function () { process.exit(0); }, 500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
