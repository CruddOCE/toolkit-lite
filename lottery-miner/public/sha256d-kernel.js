// The WGSL compute shader, kept as a string so the page stays a plain static
// file with no build step and no fetch for a second asset.
//
// One invocation tests one nonce. Layout of the params buffer, all u32:
//   [0..18]   header bytes 0 to 75, read as big-endian words (SHA-256 word order)
//   [19..26]  share target, big-endian, most significant word first
//   [27]      base nonce for this dispatch
//
// The header's own nonce field is little-endian, so word 19 of the header is the
// byte-swapped nonce. That single swap is the entire reason a GPU miner either
// agrees with the CPU or silently never finds anything.
//
// Version 0.1 does all three compressions per nonce. The first 64 bytes of the
// header never change within a work unit, so its midstate could be computed once
// on the CPU and passed in, cutting the work by a third. Left for later, after
// correctness is proven against the CPU path.

export const SHA256D_WGSL = `
var<private> K: array<u32, 64> = array<u32, 64>(
  0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u,
  0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
  0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
  0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
  0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu,
  0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
  0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u,
  0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
  0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
  0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
  0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u,
  0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
  0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u,
  0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
  0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
  0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
);

var<private> IV: array<u32, 8> = array<u32, 8>(
  0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
  0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u
);

@group(0) @binding(0) var<storage, read> params: array<u32>;

struct Result {
  found: atomic<u32>,
  nonce: atomic<u32>,
};
@group(0) @binding(1) var<storage, read_write> result: Result;

fn rotr(x: u32, n: u32) -> u32 {
  return (x >> n) | (x << (32u - n));
}

fn bswap(x: u32) -> u32 {
  return ((x & 0x000000ffu) << 24u) |
         ((x & 0x0000ff00u) << 8u)  |
         ((x >> 8u) & 0x0000ff00u)  |
         ((x >> 24u) & 0x000000ffu);
}

fn compress(state: array<u32, 8>, block: array<u32, 16>) -> array<u32, 8> {
  var w: array<u32, 64>;
  var b = block;
  for (var i = 0u; i < 16u; i = i + 1u) {
    w[i] = b[i];
  }
  for (var i = 16u; i < 64u; i = i + 1u) {
    let x = w[i - 15u];
    let y = w[i - 2u];
    let s0 = rotr(x, 7u) ^ rotr(x, 18u) ^ (x >> 3u);
    let s1 = rotr(y, 17u) ^ rotr(y, 19u) ^ (y >> 10u);
    w[i] = w[i - 16u] + s0 + w[i - 7u] + s1;
  }

  var s = state;
  var a = s[0]; var bb = s[1]; var c = s[2]; var d = s[3];
  var e = s[4]; var f = s[5]; var g = s[6]; var h = s[7];

  for (var i = 0u; i < 64u; i = i + 1u) {
    let S1 = rotr(e, 6u) ^ rotr(e, 11u) ^ rotr(e, 25u);
    let ch = (e & f) ^ ((~e) & g);
    let t1 = h + S1 + ch + K[i] + w[i];
    let S0 = rotr(a, 2u) ^ rotr(a, 13u) ^ rotr(a, 22u);
    let maj = (a & bb) ^ (a & c) ^ (bb & c);
    let t2 = S0 + maj;
    h = g; g = f; f = e; e = d + t1;
    d = c; c = bb; bb = a; a = t1 + t2;
  }

  return array<u32, 8>(
    s[0] + a, s[1] + bb, s[2] + c, s[3] + d,
    s[4] + e, s[5] + f, s[6] + g, s[7] + h
  );
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let nonce = params[27] + gid.x;

  var block1: array<u32, 16>;
  for (var i = 0u; i < 16u; i = i + 1u) {
    block1[i] = params[i];
  }
  var state = compress(IV, block1);

  // Second block of the 80-byte header: three remaining header words, the nonce,
  // then the padding and the 640-bit length.
  var block2: array<u32, 16>;
  block2[0] = params[16];
  block2[1] = params[17];
  block2[2] = params[18];
  block2[3] = bswap(nonce);
  block2[4] = 0x80000000u;
  for (var i = 5u; i < 15u; i = i + 1u) {
    block2[i] = 0u;
  }
  block2[15] = 640u;
  state = compress(state, block2);

  // Second pass over the 32-byte digest.
  var block3: array<u32, 16>;
  for (var i = 0u; i < 8u; i = i + 1u) {
    block3[i] = state[i];
  }
  block3[8] = 0x80000000u;
  for (var i = 9u; i < 15u; i = i + 1u) {
    block3[i] = 0u;
  }
  block3[15] = 256u;
  var digest = compress(IV, block3);

  // The digest is a little-endian 256-bit number, so its most significant word
  // is the byte-swapped last word of the hash.
  for (var k = 0u; k < 8u; k = k + 1u) {
    let hw = bswap(digest[7u - k]);
    let tw = params[19u + k];
    if (hw < tw) {
      atomicStore(&result.nonce, nonce);
      atomicStore(&result.found, 1u);
      return;
    }
    if (hw > tw) {
      return;
    }
  }
}
`;
