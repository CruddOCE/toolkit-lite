'use strict';

// Hand-rolled, no framework, matching the rest of the workspace.
//
// The two block vectors are the point of this file. If buildHeader can turn
// stratum-shaped inputs into the real header of a real block, then every byte
// order in job.js is right, which is the only thing standing between a working
// miner and one that is rejected on every share for reasons no log will explain.

const job = require('../src/job');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = String(actual);
  const e = String(expected);
  if (a === e) {
    passed += 1;
    console.log('  ok   ' + name);
  } else {
    failed += 1;
    console.log('  FAIL ' + name);
    console.log('       expected: ' + e);
    console.log('       actual:   ' + a);
  }
}

function assert(name, condition) {
  check(name, Boolean(condition), true);
}

console.log('\nheader assembly');

// Block 125552, the standard vector. Values below are the stratum wire forms.
const b125552 = job.buildHeader({
  version: '00000001',
  prevhash: 'ab02cd818b9e567ee21793cddef299feb29ad444a41b85b8000008a300000000',
  merkleRoot: job.reverseBytes(
    Buffer.from(
      '2b12fcf1b09288fcaff797d71e950e71ae42b91e8bdb2304758dfcffc2b620e3',
      'hex'
    )
  ),
  ntime: '4dd7f5c7',
  nbits: '1a44b9f2',
  nonce: 2504433986,
});

check(
  'block 125552 raw header',
  b125552.toString('hex'),
  '01000000' +
    '81cd02ab7e569e8bcd9317e2fe99f2de44d49ab2b8851ba4a308000000000000' +
    'e320b6c2fffc8d750423db8b1eb942ae710e951ed797f7affc8892b0f1fc122b' +
    'c7f5d74d' +
    'f2b9441a' +
    '42a14695'
);

check(
  'block 125552 hash',
  job.hashToDisplayHex(job.sha256d(b125552)),
  '00000000000000001e8d6829a8a21adc5d38d0a473b144b6765798e61f98bd1d'
);

const genesis = job.buildHeader({
  version: '00000001',
  prevhash: '0'.repeat(64),
  merkleRoot: Buffer.from(
    '3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a',
    'hex'
  ),
  ntime: '495fab29',
  nbits: '1d00ffff',
  nonce: 2083236893,
});

check(
  'genesis block hash',
  job.hashToDisplayHex(job.sha256d(genesis)),
  '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
);

console.log('\nbyte order helpers');

check(
  'prevhash word swap',
  job.prevhashToHeader('ab02cd818b9e567ee21793cddef299feb29ad444a41b85b8000008a300000000')
    .toString('hex'),
  '81cd02ab7e569e8bcd9317e2fe99f2de44d49ab2b8851ba4a308000000000000'
);

check('swap32 of ntime', job.swap32Hex('4dd7f5c7').toString('hex'), 'c7f5d74d');

check(
  'extranonce2 is little endian',
  job.encodeExtranonce2(1, 4).toString('hex'),
  '01000000'
);
check(
  'extranonce2 wide value',
  job.encodeExtranonce2(0x1234, 4).toString('hex'),
  '34120000'
);

console.log('\nmerkle root');

const coinbase = Buffer.from('deadbeefcafe', 'hex');
check(
  'empty branch is just the coinbase hash',
  job.merkleRoot(coinbase, []).toString('hex'),
  job.sha256d(coinbase).toString('hex')
);

const branch = 'aa'.repeat(32);
check(
  'single branch concatenates without reversing',
  job.merkleRoot(coinbase, [branch]).toString('hex'),
  job
    .sha256d(Buffer.concat([job.sha256d(coinbase), Buffer.from(branch, 'hex')]))
    .toString('hex')
);

const branchTwo = 'bb'.repeat(32);
check(
  'two branches fold left to right',
  job.merkleRoot(coinbase, [branch, branchTwo]).toString('hex'),
  job
    .sha256d(
      Buffer.concat([
        job.sha256d(Buffer.concat([job.sha256d(coinbase), Buffer.from(branch, 'hex')])),
        Buffer.from(branchTwo, 'hex'),
      ])
    )
    .toString('hex')
);

console.log('\ncoinbase assembly');

check(
  'coinbase splices both extranonces in order',
  job
    .buildCoinbase({ coinb1: '01ab', coinb2: 'ff02' }, 'c0de', '00000001')
    .toString('hex'),
  '01abc0de00000001ff02'
);

console.log('\ntargets');

check(
  'nbits 1d00ffff is difficulty 1',
  job.targetFromBits('1d00ffff'),
  job.DIFF1_TARGET
);
check(
  'difficulty 1 target',
  job.targetFromDifficulty(1),
  job.DIFF1_TARGET
);
assert(
  'block 125552 target is harder than difficulty 1',
  job.targetFromBits('1a44b9f2') < job.DIFF1_TARGET
);
assert(
  'fractional pool difficulty gives an easier target',
  job.targetFromDifficulty(0.5) > job.DIFF1_TARGET
);
assert(
  'higher pool difficulty gives a harder target',
  job.targetFromDifficulty(1000) < job.targetFromDifficulty(10)
);

// Genesis only had to beat difficulty 1, but the hash Satoshi found was a good
// deal better than required, so its share difficulty is a fixed known number.
check(
  'genesis hash share difficulty',
  job.difficultyOfHash(job.sha256d(genesis)).toFixed(3),
  '2536.426'
);

const b125552Diff = job.difficultyOfHash(job.sha256d(b125552));
assert('block 125552 scores its era difficulty', b125552Diff > 200000);

console.log('\nshare validity');

// The check every worker performs: is this digest below the share target.
assert(
  'genesis hash meets a difficulty 1 target',
  job.hashToBigInt(job.sha256d(genesis)) < job.targetFromDifficulty(1)
);
assert(
  'genesis hash does not meet the network target of block 125552',
  job.hashToBigInt(job.sha256d(genesis)) > job.targetFromBits('1a44b9f2')
);

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed === 0 ? 0 : 1);
