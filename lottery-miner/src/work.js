'use strict';

// Hands out work units.
//
// The nonce field is only 32 bits, which at a gigahash is four seconds of work.
// So the nonce is not what splits work between consumers: extranonce2 is. Every
// consumer gets its own extranonce2, which gives it a unique coinbase, a unique
// merkle root, and therefore the entire nonce range to itself. Two consumers can
// never duplicate each other's work, and nobody has to coordinate ranges.
//
// The merkle maths happens here, once per unit, rather than in each worker. At a
// few units per second that cost is irrelevant, and it keeps the workers and the
// GPU page as dumb hash loops that only need a header prefix and a target.

const job = require('./job');

function createDispenser() {
  let current = null;
  let generation = 0;
  let extranonce2Counter = 0;

  function setJob(notify) {
    generation += 1;
    extranonce2Counter = 0;
    current = {
      notify: notify,
      shareTarget: job.targetFromDifficulty(notify.difficulty),
      networkTarget: job.targetFromBits(notify.nbits),
      generation: generation,
    };
    return current;
  }

  // Returns null when no job has arrived yet, which is normal for the first
  // second or two after connecting.
  function nextUnit() {
    if (!current) return null;
    const n = current.notify;

    const extranonce2 = job.encodeExtranonce2(extranonce2Counter, n.extranonce2Size);
    extranonce2Counter += 1;

    const coinbase = job.buildCoinbase(n, n.extranonce1, extranonce2.toString('hex'));
    const root = job.merkleRoot(coinbase, n.merkleBranch);

    const header = job.buildHeader({
      version: n.version,
      prevhash: n.prevhash,
      merkleRoot: root,
      ntime: n.ntime,
      nbits: n.nbits,
      nonce: 0,
    });

    return {
      generation: current.generation,
      jobId: n.jobId,
      ntime: n.ntime,
      extranonce2Hex: extranonce2.toString('hex'),
      // Bytes 0 to 75. The last four bytes of the header are the nonce, which is
      // the consumer's to fill in.
      prefixHex: header.slice(0, 76).toString('hex'),
      shareTargetHex: job.targetToHex(current.shareTarget),
      difficulty: n.difficulty,
    };
  }

  function getCurrent() {
    return current;
  }

  // Rebuilds the full header for a claimed hit so the result can be checked
  // before it is sent to the pool. Never trust a number that came back over a
  // WebSocket from a browser.
  function verifyHit(unit, nonce) {
    if (!current || current.generation !== unit.generation) return null;
    const header = Buffer.concat([
      Buffer.from(unit.prefixHex, 'hex'),
      Buffer.alloc(4),
    ]);
    header.writeUInt32LE(nonce >>> 0, 76);
    const digest = job.sha256d(header);
    const value = job.hashToBigInt(digest);
    return {
      digest: digest,
      value: value,
      displayHash: job.hashToDisplayHex(digest),
      shareDifficulty: job.difficultyOfHash(digest),
      meetsShare: value < current.shareTarget,
      meetsNetwork: value < current.networkTarget,
    };
  }

  return {
    setJob: setJob,
    nextUnit: nextUnit,
    getCurrent: getCurrent,
    verifyHit: verifyHit,
    getGeneration: function () { return generation; },
  };
}

module.exports = { createDispenser };
