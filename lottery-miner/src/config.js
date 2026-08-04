'use strict';

// Config comes from a hand-edited .env, so everything here assumes it can be
// absent, blank, or the wrong shape. A bad payout address in particular has to
// fail at startup: the pool will happily accept shares against a malformed
// username and simply never pay anyone.

const os = require('os');

function parseIntOr(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseFloatOr(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseList(value, fallback) {
  if (value === undefined) return fallback;
  return String(value)
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
}

// Deliberately loose. This catches typos and empty strings, not invalid
// checksums, because rejecting a valid address the user actually holds would be
// worse than letting an exotic one through.
function looksLikeBitcoinAddress(address) {
  if (!address || typeof address !== 'string') return false;
  if (/^bc1[023456789acdefghjklmnpqrstuvwxyz]{11,71}$/.test(address)) return true;
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
  return false;
}

function defaultThreads() {
  // Leave one physical core free so the desktop stays usable. os.cpus() reports
  // logical processors, and SMT siblings add little to a hash loop.
  const logical = os.cpus().length;
  return Math.max(1, logical - 1);
}

function loadConfig(env) {
  const source = env || process.env;
  const address = (source.BTC_ADDRESS || '').trim();

  if (!looksLikeBitcoinAddress(address)) {
    throw new Error(
      'BTC_ADDRESS is missing or does not look like a Bitcoin address. ' +
        'Copy .env.example to .env and set it to an address you hold the keys for.'
    );
  }

  const threads = source.CPU_THREADS === undefined || source.CPU_THREADS === ''
    ? defaultThreads()
    : parseIntOr(source.CPU_THREADS, defaultThreads());

  return {
    address: address,
    poolHost: (source.POOL_HOST || 'solo.ckpool.org').trim(),
    poolPort: parseIntOr(source.POOL_PORT, 3333),
    workerName: (source.WORKER_NAME || 'rig').trim(),
    cpuThreads: Math.max(0, threads),
    gpuEnabled: parseBool(source.GPU_ENABLED, true),
    // Ask for the floor and let the pool's own vardiff raise it to match what
    // this machine actually delivers. Guessing high just hides the miner.
    suggestDifficulty: parseFloatOr(source.SUGGEST_DIFFICULTY, 1),
    // 8090 and 8091 are already spoken for on this machine, 8091 by twitch-bot's
    // test alert server.
    httpPort: parseIntOr(source.HTTP_PORT, 8093),
    autopauseProcesses: parseList(source.AUTOPAUSE_PROCESSES, [
      'obs64.exe',
      'starcitizen.exe',
    ]),
    pausedCpuFraction: Math.min(1, Math.max(0, parseFloatOr(source.PAUSED_CPU_FRACTION, 0.25))),
  };
}

module.exports = { loadConfig, looksLikeBitcoinAddress, defaultThreads };
