'use strict';

// One hashing thread.
//
// Uses node's crypto rather than a JS SHA-256 implementation. Per call there is
// real binding overhead, but OpenSSL's compression function still beats anything
// written in JS by enough to win at this input size. A midstate cache would skip
// one of the three compressions and is the obvious next optimisation, left out
// of 0.1 so that correctness is established first.
//
// The comparison never touches BigInt in the hot loop. Converting a digest to a
// BigInt costs more than hashing it, so the target is pre-split into a count of
// leading zero bytes plus the first significant byte, and only a digest that
// survives that gets compared properly.

const crypto = require('crypto');
const { parentPort, workerData } = require('worker_threads');

const REPORT_INTERVAL_MS = 1000;

const state = {
  unit: null,
  header: Buffer.alloc(80),
  targetBE: null,
  zeroBytes: 0,
  pivotByte: 0,
  nonce: 0,
  hashes: 0,
  lastReport: Date.now(),
  paused: false,
};

function loadUnit(unit) {
  state.unit = unit;
  Buffer.from(unit.prefixHex, 'hex').copy(state.header, 0);
  state.targetBE = Buffer.from(unit.shareTargetHex, 'hex');

  let z = 0;
  while (z < 32 && state.targetBE[z] === 0) z += 1;
  state.zeroBytes = z;
  state.pivotByte = z < 32 ? state.targetBE[z] : 0;

  // Each worker starts at a different point in the nonce space so that if two
  // ever share a unit by accident they still do not tread on each other.
  state.nonce = workerData.nonceStart >>> 0;
}

// Full comparison, only reached by a digest that already passed the cheap test.
function belowTarget(digest) {
  for (let k = 0; k < 32; k += 1) {
    const h = digest[31 - k];
    const t = state.targetBE[k];
    if (h !== t) return h < t;
  }
  return false;
}

function report(force) {
  const now = Date.now();
  if (!force && now - state.lastReport < REPORT_INTERVAL_MS) return;
  parentPort.postMessage({
    type: 'rate',
    hashes: state.hashes,
    ms: now - state.lastReport,
  });
  state.hashes = 0;
  state.lastReport = now;
}

function loop() {
  if (state.paused || !state.unit) {
    setTimeout(loop, 200);
    return;
  }

  const header = state.header;
  const zeroBytes = state.zeroBytes;
  const pivot = state.pivotByte;
  const deadline = Date.now() + 250;
  let nonce = state.nonce;
  let count = 0;
  let exhausted = false;

  while (count < 500000) {
    header.writeUInt32LE(nonce, 76);
    const digest = crypto
      .createHash('sha256')
      .update(crypto.createHash('sha256').update(header).digest())
      .digest();

    let candidate = true;
    for (let k = 0; k < zeroBytes; k += 1) {
      if (digest[31 - k] !== 0) { candidate = false; break; }
    }
    if (candidate && digest[31 - zeroBytes] <= pivot) {
      if (belowTarget(digest)) {
        parentPort.postMessage({ type: 'hit', unit: state.unit, nonce: nonce >>> 0 });
      }
    }

    count += 1;
    nonce = (nonce + 1) >>> 0;
    if (nonce === (workerData.nonceStart >>> 0)) { exhausted = true; break; }
    if ((count & 0x3fff) === 0 && Date.now() > deadline) break;
  }

  state.nonce = nonce;
  state.hashes += count;
  report(false);

  if (exhausted) {
    // The whole nonce range for this extranonce2 is spent, so ask for another.
    state.unit = null;
    parentPort.postMessage({ type: 'exhausted' });
  }

  setImmediate(loop);
}

parentPort.on('message', function (msg) {
  if (msg.type === 'unit') loadUnit(msg.unit);
  else if (msg.type === 'pause') state.paused = true;
  else if (msg.type === 'resume') state.paused = false;
  else if (msg.type === 'stop') process.exit(0);
});

parentPort.postMessage({ type: 'ready' });
loop();
