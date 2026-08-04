'use strict';

// Manages the CPU worker threads.
//
// Workers are long lived and are never torn down for a new job. A new job just
// means the next unit they are handed belongs to a new generation, and any hit
// carrying a stale generation is dropped upstream in work.js. Restarting threads
// on every mining.notify would spend more time spawning than hashing, since the
// pool sends a fresh job roughly every thirty seconds.

const path = require('path');
const { Worker } = require('worker_threads');

function createCpuPool(options) {
  const workers = [];
  let running = false;
  let activeCount = 0;

  function spawn(index, total) {
    const worker = new Worker(path.join(__dirname, 'cpu-worker.js'), {
      workerData: {
        index: index,
        // Spread the starting nonces evenly so two workers that somehow end up
        // on the same unit still search different parts of the space first.
        nonceStart: Math.floor((0x100000000 / total) * index) >>> 0,
      },
    });

    const record = { worker: worker, index: index, paused: false };

    worker.on('message', function (msg) {
      if (msg.type === 'rate') {
        options.onRate(msg.hashes, msg.ms);
      } else if (msg.type === 'hit') {
        options.onHit(msg.unit, msg.nonce);
      } else if (msg.type === 'ready' || msg.type === 'exhausted') {
        feed(record);
      }
    });

    worker.on('error', function (err) {
      options.onLog('cpu worker ' + index + ' error: ' + err.message);
    });

    worker.on('exit', function () {
      const at = workers.indexOf(record);
      if (at !== -1) workers.splice(at, 1);
      if (running) {
        options.onLog('cpu worker ' + index + ' exited, respawning');
        spawn(index, total);
      }
    });

    workers.push(record);
    return record;
  }

  function feed(record) {
    if (!running) return;
    const unit = options.nextUnit();
    if (!unit) {
      // No job from the pool yet. Try again shortly rather than spinning.
      setTimeout(function () { feed(record); }, 500);
      return;
    }
    record.worker.postMessage({ type: 'unit', unit: unit });
  }

  // Called on every new job so workers move onto it promptly instead of
  // finishing a four billion nonce sweep of work the pool has already replaced.
  function refresh() {
    for (let i = 0; i < workers.length; i += 1) {
      if (!workers[i].paused) feed(workers[i]);
    }
  }

  function start(threads) {
    if (running) return;
    running = true;
    activeCount = threads;
    for (let i = 0; i < threads; i += 1) spawn(i, threads);
    options.onLog('cpu pool started with ' + threads + ' threads');
  }

  // Pausing keeps a fraction of the threads alive rather than stopping outright,
  // so the miner stays connected and keeps submitting the occasional share while
  // a stream is running.
  function setPaused(paused, fraction) {
    const keep = paused ? Math.max(1, Math.floor(activeCount * fraction)) : activeCount;
    for (let i = 0; i < workers.length; i += 1) {
      const shouldPause = i >= keep;
      if (workers[i].paused === shouldPause) continue;
      workers[i].paused = shouldPause;
      workers[i].worker.postMessage({ type: shouldPause ? 'pause' : 'resume' });
      if (!shouldPause) feed(workers[i]);
    }
  }

  function stop() {
    running = false;
    for (let i = 0; i < workers.length; i += 1) {
      workers[i].worker.postMessage({ type: 'stop' });
      workers[i].worker.terminate();
    }
    workers.length = 0;
  }

  return {
    start: start,
    stop: stop,
    refresh: refresh,
    setPaused: setPaused,
    getThreadCount: function () { return workers.length; },
    getActiveCount: function () {
      return workers.filter(function (w) { return !w.paused; }).length;
    },
  };
}

module.exports = { createCpuPool };
