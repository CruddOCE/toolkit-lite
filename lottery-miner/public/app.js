// Dashboard, and the host for the GPU miner.
//
// One socket does both jobs. The page connects as a dashboard, and only
// re-announces itself as a miner once WebGPU has actually initialised, so a
// browser without WebGPU still shows every number, it just contributes nothing.

import { createGpuMiner } from './miner-gpu.js';

const el = function (id) { return document.getElementById(id); };

let socket = null;
let miner = null;
let minerReady = false;

function formatHashrate(rate) {
  if (!rate || rate < 1) return '0 H/s';
  const units = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s'];
  let value = rate;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return value.toFixed(value < 10 ? 2 : 1) + ' ' + units[unit];
}

function formatCount(n) {
  if (!n) return '0';
  return Math.round(n).toLocaleString('en-US');
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + (m % 60) + 'm';
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
}

// Expected time to a block is difficulty times 2^32 divided by hashrate. It is
// shown honestly rather than rounded into something encouraging.
function formatExpectedWait(hashrate, networkDifficulty) {
  if (!hashrate || !networkDifficulty) return 'a very long time';
  const seconds = (networkDifficulty * 4294967296) / hashrate;
  const years = seconds / (365.25 * 24 * 3600);
  if (years < 1) return Math.round(seconds / 86400) + ' days';
  if (years < 1000) return Math.round(years).toLocaleString('en-US') + ' years';
  if (years < 1e6) {
    return Math.round(years / 1000).toLocaleString('en-US') + ' thousand years';
  }
  return (years / 1e6).toFixed(1) + ' million years';
}

function render(stats) {
  el('total-rate').textContent = formatHashrate(stats.totalHashrate);
  el('cpu-rate').textContent = formatHashrate(stats.cpuHashrate);
  el('gpu-rate').textContent = formatHashrate(stats.gpuHashrate);
  el('threads').textContent =
    stats.cpuActive + ' of ' + stats.cpuThreads + ' active';
  el('uptime').textContent = formatDuration(stats.uptimeMs);

  el('adapter').textContent =
    stats.gpuAdapter || (minerReady ? 'starting' : 'not started');

  const dot = el('pool-dot');
  dot.className = 'dot ' + (stats.poolConnected ? 'dot--live' : 'dot--danger');
  el('pool-status').textContent = stats.poolConnected ? 'connected' : 'offline';
  el('pool-host').textContent = stats.poolHost;
  el('address').textContent = stats.address;
  el('job-id').textContent = stats.jobId || 'none';
  el('share-diff').textContent = formatCount(stats.difficulty);
  el('net-diff').textContent = stats.networkDifficulty
    ? formatCount(stats.networkDifficulty)
    : 'unknown';

  el('accepted').textContent = formatCount(stats.accepted);
  el('rejected').textContent = formatCount(stats.rejected);
  el('best-share').textContent = stats.bestShare
    ? stats.bestShare.toFixed(stats.bestShare < 100 ? 3 : 0)
    : '0';
  el('blocks').textContent = formatCount(stats.blocksFound);
  el('best-hash').textContent = stats.bestShareHash || '';

  el('expected-time').textContent = formatExpectedWait(
    stats.totalHashrate,
    stats.networkDifficulty
  );

  if (stats.networkDifficulty && stats.bestShare) {
    const fraction = Math.min(1, stats.bestShare / stats.networkDifficulty);
    el('best-progress').style.width = (fraction * 100).toFixed(6) + '%';
    const percent = fraction * 100;
    el('progress-caption').textContent =
      'Best share is ' +
      (percent < 0.001 ? percent.toExponential(2) : percent.toFixed(4)) +
      '% of the way to a block.';
  }

  const banner = el('pause-banner');
  banner.hidden = !stats.paused;
  if (stats.paused) {
    el('pause-reason').textContent =
      (stats.pauseTrigger || 'a watched process') + ' is running, so the GPU is idle';
  }

  if (Array.isArray(stats.log)) {
    const box = el('log');
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
    box.textContent = stats.log.join('\n');
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
}

function sendJson(payload) {
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(protocol + '//' + location.host);

  socket.addEventListener('open', function () {
    sendJson({ type: 'hello', role: minerReady ? 'miner' : 'dashboard',
      adapter: miner ? miner.getAdapterName() : null });
  });

  socket.addEventListener('message', function (event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (msg.type === 'stats') render(msg.stats);
    else if (msg.type === 'unit' && miner) miner.setUnit(msg.unit);
    else if (msg.type === 'paused' && miner) miner.setPaused(msg.paused);
  });

  socket.addEventListener('close', function () {
    setTimeout(connect, 2000);
  });
}

async function startGpu() {
  el('gpu-start').disabled = true;
  el('adapter').textContent = 'initialising';

  miner = createGpuMiner({
    onRate: function (hashes, ms) {
      sendJson({ type: 'rate', hashes: hashes, ms: ms });
    },
    onHit: function (unit, nonce) {
      sendJson({ type: 'hit', unit: unit, nonce: nonce });
    },
    onNeedUnit: function () {
      sendJson({ type: 'need-unit' });
    },
    onError: function (message) {
      sendJson({ type: 'error', message: message });
      el('adapter').textContent = message;
    },
  });

  try {
    const name = await miner.init();
    minerReady = true;
    el('adapter').textContent = name;
    sendJson({ type: 'hello', role: 'miner', adapter: name });
    miner.start();
  } catch (err) {
    el('adapter').textContent = err.message;
    el('gpu-start').disabled = false;
    miner = null;
  }
}

el('gpu-start').addEventListener('click', startGpu);
el('gpu-stop').addEventListener('click', function () {
  if (miner) miner.stop();
  minerReady = false;
  el('gpu-start').disabled = false;
  el('adapter').textContent = 'stopped';
  sendJson({ type: 'hello', role: 'dashboard' });
});

connect();
