# lottery-miner

Bitcoin solo miner for this workstation. Hashes on both the Ryzen CPU and the
Radeon GPU, connects to a solo pool, and pays the entire block reward to one
address if it ever wins.

Version 0.1.

## Read this part first

Measured on this machine, not estimated:

| | |
|---|---|
| GPU (RX 9070 GRE, WebGPU) | 1.00 GH/s |
| CPU (Ryzen 5 7500X3D, 11 threads) | 2.0 MH/s |
| Total | ~1.01 GH/s |
| Network difficulty at time of test | 126,231,507,121,868 |
| Expected time to find a block | **17.1 million years** |

That number is the honest one and it is not a rounding error. A $150 Bitaxe at
1.2 TH/s is roughly 1200 times faster than this entire machine, because SHA-256d
is the one workload where general-purpose silicon lost to ASICs completely.

Running cost is real even though the reward is not. The card under continuous
compute load plus the CPU is somewhere around 300 W, so on the order of 220 kWh
a month. Apply your own tariff.

Run it because watching the best-share number climb is fun, or because a solo
miner builds its own block template and that is a small contribution to
decentralisation. Do not run it expecting income.

**CPU hashing ships off**, because it is not worth its power. At 2.0 MH/s it
contributes 0.2% of total hashrate while drawing perhaps 90 W, and it makes the
machine less responsive for nothing. Set `CPU_THREADS` to a number, or blank it
to mean cores minus 1, if you want it back.

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and set `BTC_ADDRESS` to an address **you hold the
keys for**. The block reward pays directly to it, so an address you cannot spend
from is the same as no address at all. Native segwit (`bc1q...`) is the safest
choice for pool payout scripts.

```bash
npm start
```

Then open <http://localhost:8093> and press **Start GPU**. That page has to stay
open, because the WebGPU kernel runs inside it. Closing the tab stops the GPU.

Out of the box the GPU is the only thing hashing. See the note above on why the
CPU is off.

## Configuration

Everything lives in `.env`. See `.env.example` for the full list.

| Key | Default | Notes |
|---|---|---|
| `BTC_ADDRESS` | none | Required. Must be an address you control. |
| `POOL_HOST` / `POOL_PORT` | `solo.ckpool.org` / `3333` | Winner takes the block, minus ckpool's 2%. |
| `CPU_THREADS` | `0` | Off. Blank means cores minus 1. See the note above. |
| `GPU_ENABLED` | `true` | |
| `SUGGEST_DIFFICULTY` | `1` | Share frequency only. Has no effect on the odds. |
| `HTTP_PORT` | `8093` | 8090 and 8091 are taken by other projects here. |
| `AUTOPAUSE_PROCESSES` | `obs64.exe,StarCitizen.exe` | GPU stops entirely while any of these run. |
| `PAUSED_CPU_FRACTION` | `0.25` | Threads kept alive while paused. |

### Autopause

A compute job saturating the card is exactly the kind of contention that surfaces
as dropped frames in OBS twenty minutes later and gets blamed on the ISP. So the
GPU stops completely whenever OBS or Star Citizen is running, the CPU drops to a
quarter of its threads, and the pool connection stays up throughout. Nothing
needs restarting when the stream ends.

## How it works

```
solo.ckpool.org  <--- stratum v1 (TCP) --->  index.js
                                               |
                                               +-- src/work.js      builds work units
                                               +-- src/cpu-pool.js  worker threads, off by default
                                               +-- src/gpu-bridge.js
                                                        |
                                                        +-- WebSocket --> browser page
                                                                            WebGPU kernel
```

The GPU runs in a browser rather than in node because that is the only way to
reach the card here without a native toolchain or a downloaded mining binary. The
page is a hash loop with a socket attached. All protocol and byte-order work
stays on the server.

**Work splitting.** The nonce field is 32 bits, which at a gigahash is four
seconds. So the nonce is not what divides work between consumers: `extranonce2`
is. Each consumer gets its own, which gives it a unique coinbase, a unique merkle
root, and therefore the whole nonce space to itself. Two consumers can never
duplicate each other's work and nobody has to negotiate ranges.

**Trust.** A hit arriving from the browser is a claim, not a fact. Every one is
re-hashed in `src/work.js` before it goes near the pool.

## Verification

`npm test` covers the byte-order maths, which is where mining bugs hide. A miner
with one endianness wrong runs at full speed and simply never wins, which looks
exactly like bad luck.

The two load-bearing tests rebuild the real headers of **Bitcoin block 125552**
and the **genesis block** from stratum-shaped inputs and check they hash to the
known block hashes.

The GPU kernel gets the same treatment at runtime. Before it is allowed to mine,
it is handed block 125552's header and has to rediscover nonce 2504433986. If it
cannot, that device does not mine. This catches the failure mode where a subtly
wrong kernel hashes perfectly happily and never finds anything.

Verified live against solo.ckpool.org on 2026-08-04: handshake, subscribe,
authorize, job parsing, and 18 shares accepted with 0 rejected at 1.01 GH/s.

## Known limits

- **No midstate caching.** The first 64 bytes of a header are constant within a
  work unit, so its midstate could be computed once and passed in, cutting the
  GPU's work by a third and the CPU's similarly. Left out of 0.1 so correctness
  came first. This is the obvious next change.
- **The WGSL kernel is not hand-tuned.** A dedicated OpenCL kernel would likely
  be 3x to 5x faster. It would not change anything you would notice.
- **CPU hashing is slow** at about 180 kH/s per thread, dominated by per-call
  overhead in node's crypto binding rather than by SHA-256 itself.
- **The GPU needs an open browser tab.** Node 24 has an experimental native
  WebGPU flag that could remove that, but betting on an experimental flag plus
  AMD driver behaviour was not worth it for 0.1.
- **Bitcoin only.** No other coins or algorithms.
