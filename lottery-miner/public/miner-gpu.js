// WebGPU side of the miner.
//
// This runs in a browser rather than in node because it is the only way to reach
// the GPU on this machine without a native toolchain or a downloaded binary. The
// page is a hash loop with a socket attached: it asks the server for a work unit,
// grinds nonces at it, and reports rates and hits back. All of the protocol and
// all of the byte-order work stays on the server side.

import { SHA256D_WGSL } from './sha256d-kernel.js';

const WORKGROUP_SIZE = 256;
const TARGET_DISPATCH_MS = 60;
const MAX_WORKGROUPS = 32768;
const NONCE_SPACE = 4294967296;

export function createGpuMiner(handlers) {
  const state = {
    device: null,
    pipeline: null,
    paramsBuffer: null,
    resultBuffer: null,
    stagingBuffer: null,
    bindGroup: null,
    params: new Uint32Array(28),
    unit: null,
    nonceBase: 0,
    workgroups: 2048,
    running: false,
    paused: false,
    hashesSinceReport: 0,
    lastReport: performance.now(),
    adapterName: null,
  };

  async function init() {
    if (!navigator.gpu) {
      throw new Error(
        'This browser has no WebGPU. Chrome or Edge 113 and later support it.'
      );
    }
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!adapter) {
      throw new Error('No WebGPU adapter. The GPU driver may not expose one.');
    }

    // adapter.info is the current spec surface, requestAdapterInfo() the older
    // one. Neither is guaranteed, so a missing name is not an error.
    let info = adapter.info || null;
    if (!info && adapter.requestAdapterInfo) {
      info = await adapter.requestAdapterInfo();
    }
    state.adapterName = info
      ? [info.vendor, info.architecture, info.device, info.description]
          .filter(Boolean)
          .join(' ')
          .trim() || 'WebGPU adapter'
      : 'WebGPU adapter';

    state.device = await adapter.requestDevice();
    state.device.lost.then(function (reason) {
      state.running = false;
      handlers.onError('GPU device lost: ' + (reason && reason.message));
    });

    const module = state.device.createShaderModule({ code: SHA256D_WGSL });
    state.pipeline = state.device.createComputePipeline({
      layout: 'auto',
      compute: { module: module, entryPoint: 'main' },
    });

    state.paramsBuffer = state.device.createBuffer({
      size: state.params.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    state.resultBuffer = state.device.createBuffer({
      size: 8,
      usage:
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    state.stagingBuffer = state.device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    state.bindGroup = state.device.createBindGroup({
      layout: state.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: state.paramsBuffer } },
        { binding: 1, resource: { buffer: state.resultBuffer } },
      ],
    });

    await selfTest();

    return state.adapterName;
  }

  // Known-answer test, run once before any real hashing.
  //
  // A GPU kernel that is subtly wrong does not crash. It hashes at full speed
  // and simply never finds anything, which is indistinguishable from ordinary
  // bad luck and would go unnoticed indefinitely. So the kernel is handed the
  // real header of block 125552 and has to rediscover its nonce. If it cannot,
  // this card does not get to mine.
  const KAT = {
    prefixHex:
      '01000000' +
      '81cd02ab7e569e8bcd9317e2fe99f2de44d49ab2b8851ba4a308000000000000' +
      'e320b6c2fffc8d750423db8b1eb942ae710e951ed797f7affc8892b0f1fc122b' +
      'c7f5d74d' +
      'f2b9441a',
    targetHex: '00000000000044b9f2' + '0'.repeat(46),
    nonce: 2504433986,
  };

  async function selfTest() {
    const device = state.device;
    const probe = new Uint32Array(28);
    hexToWordsBE(KAT.prefixHex, probe, 0, 19);
    hexToWordsBE(KAT.targetHex, probe, 19, 8);
    probe[27] = (KAT.nonce - 1000) >>> 0;

    device.queue.writeBuffer(state.paramsBuffer, 0, probe);
    device.queue.writeBuffer(state.resultBuffer, 0, new Uint32Array([0, 0]));

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(state.pipeline);
    pass.setBindGroup(0, state.bindGroup);
    pass.dispatchWorkgroups(8);
    pass.end();
    encoder.copyBufferToBuffer(state.resultBuffer, 0, state.stagingBuffer, 0, 8);
    device.queue.submit([encoder.finish()]);

    await state.stagingBuffer.mapAsync(GPUMapMode.READ);
    const out = new Uint32Array(state.stagingBuffer.getMappedRange().slice(0));
    state.stagingBuffer.unmap();

    if (out[0] !== 1 || out[1] !== KAT.nonce) {
      throw new Error(
        'GPU self test failed: expected nonce ' + KAT.nonce + ', got ' +
          (out[0] === 1 ? out[1] : 'nothing') + '. Not mining on this device.'
      );
    }
  }

  function hexToWordsBE(hex, out, offset, wordCount) {
    for (let i = 0; i < wordCount; i += 1) {
      out[offset + i] = parseInt(hex.substr(i * 8, 8), 16) >>> 0;
    }
  }

  function setUnit(unit) {
    state.unit = unit;
    state.nonceBase = 0;
    // 76 bytes of header prefix is 19 big-endian words, then 8 words of target.
    hexToWordsBE(unit.prefixHex, state.params, 0, 19);
    hexToWordsBE(unit.shareTargetHex, state.params, 19, 8);
  }

  async function runBatch() {
    const device = state.device;
    const batch = state.workgroups * WORKGROUP_SIZE;

    state.params[27] = state.nonceBase >>> 0;
    device.queue.writeBuffer(state.paramsBuffer, 0, state.params);
    device.queue.writeBuffer(state.resultBuffer, 0, new Uint32Array([0, 0]));

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(state.pipeline);
    pass.setBindGroup(0, state.bindGroup);
    pass.dispatchWorkgroups(state.workgroups);
    pass.end();
    encoder.copyBufferToBuffer(state.resultBuffer, 0, state.stagingBuffer, 0, 8);
    device.queue.submit([encoder.finish()]);

    const started = performance.now();
    await state.stagingBuffer.mapAsync(GPUMapMode.READ);
    const view = new Uint32Array(state.stagingBuffer.getMappedRange().slice(0));
    state.stagingBuffer.unmap();
    const elapsed = performance.now() - started;

    if (view[0] === 1) {
      handlers.onHit(state.unit, view[1] >>> 0);
    }

    // Keep each dispatch short enough that the page stays responsive and the
    // compositor never stalls, which on a shared card also keeps the desktop
    // usable while this runs.
    if (elapsed > 0) {
      const scale = TARGET_DISPATCH_MS / elapsed;
      const next = Math.round(state.workgroups * Math.min(2, Math.max(0.5, scale)));
      state.workgroups = Math.max(64, Math.min(MAX_WORKGROUPS, next));
    }

    state.hashesSinceReport += batch;
    state.nonceBase += batch;

    const now = performance.now();
    if (now - state.lastReport >= 1000) {
      handlers.onRate(state.hashesSinceReport, now - state.lastReport);
      state.hashesSinceReport = 0;
      state.lastReport = now;
    }

    if (state.nonceBase >= NONCE_SPACE) {
      // This extranonce2 is spent. The server hands out a fresh one, which is a
      // whole new nonce space rather than a repeat of this one.
      state.unit = null;
      handlers.onNeedUnit();
    }
  }

  async function loop() {
    while (state.running) {
      if (state.paused || !state.unit) {
        await new Promise(function (resolve) { setTimeout(resolve, 250); });
        continue;
      }
      try {
        await runBatch();
      } catch (err) {
        handlers.onError('dispatch failed: ' + err.message);
        await new Promise(function (resolve) { setTimeout(resolve, 1000); });
      }
    }
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.lastReport = performance.now();
    loop();
  }

  function stop() { state.running = false; }
  function setPaused(paused) { state.paused = paused; }

  return {
    init: init,
    start: start,
    stop: stop,
    setUnit: setUnit,
    setPaused: setPaused,
    getAdapterName: function () { return state.adapterName; },
    getBatchSize: function () { return state.workgroups * WORKGROUP_SIZE; },
    isRunning: function () { return state.running && !state.paused; },
  };
}
