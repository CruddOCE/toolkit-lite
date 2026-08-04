'use strict';

// Header assembly and target maths for stratum v1.
//
// Every byte-order decision in mining lives in this one file on purpose. Get one
// of them wrong and the miner runs happily forever while the pool rejects every
// share, which is indistinguishable from bad luck. Isolating them here means the
// whole class of bug is covered by test/run.js rather than discovered live.

const crypto = require('crypto');

const DIFF1_TARGET =
  0x00000000ffff0000000000000000000000000000000000000000000000000000n;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

function sha256d(buf) {
  return sha256(sha256(buf));
}

function reverseBytes(buf) {
  return Buffer.from(buf).reverse();
}

// Stratum sends every 32-bit header field as big-endian hex. The header itself
// serialises them little-endian, so each one is reversed on the way in.
function swap32Hex(hex) {
  return reverseBytes(Buffer.from(hex, 'hex'));
}

// The prevhash arrives as eight 4-byte words that are each individually swapped
// relative to the header field. Reversing all 32 bytes in one go is the classic
// wrong fix: it is almost right, and it fails silently.
function prevhashToHeader(hex) {
  const raw = Buffer.from(hex, 'hex');
  if (raw.length !== 32) {
    throw new Error('prevhash must be 32 bytes, got ' + raw.length);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 8; i += 1) {
    const o = i * 4;
    out[o] = raw[o + 3];
    out[o + 1] = raw[o + 2];
    out[o + 2] = raw[o + 1];
    out[o + 3] = raw[o];
  }
  return out;
}

// extranonce2 is the dimension work is split on, so it is a plain counter
// rendered to the byte width the pool asked for, least significant byte first.
function encodeExtranonce2(value, sizeBytes) {
  const out = Buffer.alloc(sizeBytes);
  let v = BigInt(value);
  for (let i = 0; i < sizeBytes; i += 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function buildCoinbase(job, extranonce1Hex, extranonce2Hex) {
  return Buffer.concat([
    Buffer.from(job.coinb1, 'hex'),
    Buffer.from(extranonce1Hex, 'hex'),
    Buffer.from(extranonce2Hex, 'hex'),
    Buffer.from(job.coinb2, 'hex'),
  ]);
}

// The branch hashes come in the same internal order the coinbase hash comes out
// in, so nothing is reversed here. Concatenate and rehash, left to right.
function merkleRoot(coinbase, branchHex) {
  let current = sha256d(coinbase);
  for (let i = 0; i < branchHex.length; i += 1) {
    current = sha256d(Buffer.concat([current, Buffer.from(branchHex[i], 'hex')]));
  }
  return current;
}

// Returns the 80-byte header. All arguments are the raw stratum hex strings
// except merkleRootBuf, which is the internal-order digest from merkleRoot().
function buildHeader(parts) {
  const header = Buffer.alloc(80);
  swap32Hex(parts.version).copy(header, 0);
  prevhashToHeader(parts.prevhash).copy(header, 4);
  parts.merkleRoot.copy(header, 36);
  swap32Hex(parts.ntime).copy(header, 68);
  swap32Hex(parts.nbits).copy(header, 72);
  header.writeUInt32LE(parts.nonce >>> 0, 76);
  return header;
}

// nbits is a compact float: one exponent byte and a three byte coefficient.
function targetFromBits(nbitsHex) {
  const bits = parseInt(nbitsHex, 16);
  const exponent = bits >>> 24;
  const coefficient = BigInt(bits & 0x00ffffff);
  if (exponent <= 3) {
    return coefficient >> BigInt(8 * (3 - exponent));
  }
  return coefficient << BigInt(8 * (exponent - 3));
}

function targetFromDifficulty(difficulty) {
  if (!(difficulty > 0)) return DIFF1_TARGET;
  // Scale by 2^32 first so fractional pool difficulties survive integer division.
  const scaled = BigInt(Math.round(difficulty * 4294967296));
  return (DIFF1_TARGET * 4294967296n) / scaled;
}

// A sha256d digest is a little-endian 256-bit number, so the displayed block
// hash is the same bytes reversed.
function hashToBigInt(digest) {
  return BigInt('0x' + reverseBytes(digest).toString('hex'));
}

function hashToDisplayHex(digest) {
  return reverseBytes(digest).toString('hex');
}

function difficultyOfHash(digest) {
  const value = hashToBigInt(digest);
  if (value === 0n) return Infinity;
  // Float division of two 256-bit ints, kept in BigInt until the last step so a
  // very good share does not lose precision on the way to the dashboard.
  return Number((DIFF1_TARGET * 1000000n) / value) / 1000000;
}

function targetToHex(target) {
  return target.toString(16).padStart(64, '0');
}

module.exports = {
  DIFF1_TARGET,
  sha256,
  sha256d,
  reverseBytes,
  swap32Hex,
  prevhashToHeader,
  encodeExtranonce2,
  buildCoinbase,
  merkleRoot,
  buildHeader,
  targetFromBits,
  targetFromDifficulty,
  hashToBigInt,
  hashToDisplayHex,
  difficultyOfHash,
  targetToHex,
};
