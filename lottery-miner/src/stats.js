'use strict';

// Rolling counters for the dashboard.
//
// Hashrate is averaged over a sliding window rather than computed from the
// lifetime total, because the number people actually want to see is what the
// machine is doing now, especially either side of an autopause.

const WINDOW_MS = 15000;

function createRateMeter() {
  const samples = [];

  function record(hashes, ms) {
    const now = Date.now();
    samples.push({ at: now, hashes: hashes });
    while (samples.length && now - samples[0].at > WINDOW_MS) samples.shift();
  }

  function rate() {
    if (samples.length < 2) return 0;
    const now = Date.now();
    const span = now - samples[0].at;
    if (span <= 0) return 0;
    let total = 0;
    for (let i = 0; i < samples.length; i += 1) total += samples[i].hashes;
    return (total / span) * 1000;
  }

  return { record: record, rate: rate };
}

function createStats() {
  const cpu = createRateMeter();
  const gpu = createRateMeter();

  const state = {
    startedAt: Date.now(),
    accepted: 0,
    rejected: 0,
    bestShare: 0,
    bestShareAt: null,
    bestShareHash: null,
    blocksFound: 0,
    lastError: null,
  };

  function recordCpu(hashes, ms) { cpu.record(hashes, ms); }
  function recordGpu(hashes, ms) { gpu.record(hashes, ms); }

  function recordShare(accepted, shareDifficulty, displayHash) {
    if (accepted) state.accepted += 1;
    else state.rejected += 1;
    if (shareDifficulty > state.bestShare) {
      state.bestShare = shareDifficulty;
      state.bestShareAt = Date.now();
      state.bestShareHash = displayHash;
    }
  }

  function recordBlock() { state.blocksFound += 1; }

  function snapshot(extra) {
    const cpuRate = cpu.rate();
    const gpuRate = gpu.rate();
    return Object.assign(
      {
        uptimeMs: Date.now() - state.startedAt,
        cpuHashrate: cpuRate,
        gpuHashrate: gpuRate,
        totalHashrate: cpuRate + gpuRate,
        accepted: state.accepted,
        rejected: state.rejected,
        bestShare: state.bestShare,
        bestShareAt: state.bestShareAt,
        bestShareHash: state.bestShareHash,
        blocksFound: state.blocksFound,
        lastError: state.lastError,
      },
      extra || {}
    );
  }

  return {
    recordCpu: recordCpu,
    recordGpu: recordGpu,
    recordShare: recordShare,
    recordBlock: recordBlock,
    snapshot: snapshot,
    setError: function (msg) { state.lastError = msg; },
  };
}

module.exports = { createStats };
