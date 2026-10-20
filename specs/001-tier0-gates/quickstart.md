# Quickstart: Tier 0 Chain Gates

**Feature**: `001-tier0-gates` | **Date**: 2026-10-20

How a stranger reproduces the tier-0 measurements. Nothing here is a product flow; it is a
validation harness. If a step cannot be repeated from this file, the gate is not reproducible.

## Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Foundry | 1.8.5 | `forge --version` |
| Node.js | 24.20.0 (LTS) | `node --version` |
| npm | 11.x | `npm --version` |

No global `solc` is needed: `forge` installs the pinned compiler on first build. No database, no
frontend, no wallet extension.

## Install

```bash
git clone <repo> makhzan && cd makhzan
cd apps/gates && npm ci
cd ../../contracts && forge build
```

`npm ci` is used, not `npm install`, so the lockfile decides versions.

## Configure

```bash
cd apps/gates && npm run keygen
```

`keygen` creates the six burner keys into a gitignored `.env` with mode 600, prints only public
addresses, and refuses to overwrite an existing `.env`. Add the endpoints to the same file:

```text
PORTALDOT_EVM_RPC_URL=
PORTALDOT_WS_URL=
PORTALDOT_EXPLORER_URL=        # optional
```

All keys are burner keys that hold test funds only. Nothing in the harness prints them, and every
recorded command shows the variable name rather than the value.

Paths: every `evidence/` path resolves from the repository root, not from `apps/gates`, even though
the commands run there. If evidence appears under `apps/gates/evidence/`, the resolver is wrong.

## 1. Start the probe (G10) before anything else

```bash
cd apps/gates && npm run probe
```

Expected: a line every 180 s in `evidence/rpc-log/<UTC date>.jsonl` containing
`evm.ok`, `evm.latencyMs`, `evm.blockNumber`, `ws.ok`, `ws.latencyMs`. Leave it running for the whole
window and after the gates finish.

Keep the machine awake for the whole window. Under WSL the daemon stops when Windows sleeps, and the
gap is real evidence: it is recorded as a gap with its start and end times and is never backfilled.
If the laptop must sleep, note the time so the gap is explained rather than mysterious.

To check progress without stopping it:

```bash
tail -n 3 evidence/rpc-log/$(date -u +%F).jsonl
```

## 2. Prove the harness works locally before touching the live chain

```bash
cd contracts && anvil --block-time 2        # terminal A
cd contracts && forge test -vv              # terminal B
```

Expected: unit and fuzz tests pass, including the Merkle position-binding test (a proof for index
`i` fails for index `j`) and a hash-only response being rejected.

## 3. Run the gates in order

Funding order matters: the owner account is funded first, and `G01` and `G02` start as soon as that
one account is usable. The other five are funded in parallel and are only needed from `G06` and
`G08`.

```bash
cd apps/gates
npm run gate -- G07     # inspect metadata, derive the faucet address, map SS58 → EVM, answer decimals
npm run gate -- G01     # deploy and call; records the compiler path that worked
npm run gate -- G02     # behavior differences, size limit, hash cost, compiler path
npm run gate -- G03     # 30+ consecutive blocks of randomness
npm run gate -- G04     # calldata ceiling, keccak ladder, Merkle gas at depths 10/14/20
npm run gate -- G05     # deal-record deposit and marginal slot cost
npm run gate -- G06     # issue/answer/resolve cost and 14-day requirement
npm run gate -- G08     # identity pallet read/write
npm run gate -- G09     # optional: ERC-20 precompile probe
```

Stop rule: a hard failure on G01 (two toolchain attempts, 48h) halts the sequence. Every other gate
records its verdict and continues. A gate that cannot run because the RPC, the funds or an upstream
gate were unavailable is recorded as blocked with a reason, never as failed; gates after a halt are
recorded as not run, so the table always has ten rows.

## 4. Validate and roll up

```bash
cd apps/gates
npm run validate        # schema + secret scan over evidence/
npm run rollup          # writes evidence/tier0-results.md from the records
```

Expected: `validate` exits 0 with "no findings"; `rollup` reports the probe coverage percentage and
the number of gaps. Review the generated table, then fill the prose sections from the records.

## What to look for (acceptance)

| Check | Passing looks like |
| --- | --- |
| Probe coverage | ≥95% of the window at 3-minute cadence, gaps listed |
| G01 | a deployed address, a read call result, and the exact compiler path recorded |
| G07 | the faucet address is derived from metadata and written down before any funding request |
| G02 | every listed behavior observed, differences enumerated, size limit and both hash ratios recorded |
| G03 | 30+ call samples and 10+ transaction samples, agreement stated, commit-reveal stated if unusable |
| G04 | four hash sizes, six Merkle combinations, calldata ceiling, one recommended block size with arithmetic |
| G05 | deal deposit and marginal slot cost in the chosen unit |
| G06 | three 14-day figures, each reproducible from per-round costs |
| G07 | six accounts with native and EVM balances, one proven mapping route, worked decimal example |
| G08 | identity read and write outcome |
| G09 | raw return data per candidate address, or an explicit "no precompile" |
| Results doc | gate table, possible/not possible/changes, eight starting facts with status |

## Reproduce a single number

Every record carries the command, the method (`estimateGas`, `receipt`, …) and the conditions. To
re-derive a measurement, run the command named in that gate's `commands[].command`, then compare to
the `measurements[]` entry by `name`. Numbers from a different method are not comparable and the
record says so.

## Outage behavior

If the RPC is down, the gate exits 2, writes a `blocked` record with the verbatim error and UTC time,
and claims no verdict. The probe keeps logging. Retry later; a gate only becomes PARTIAL or FAIL
after a real attempt returns an answer.

## Cleanup

The probe runs until stopped; stop it deliberately at the checkpoint and note the time. Tier-0 probe
contracts under `contracts/src/tier0/` are disposable and are removed or quarantined before the first
product contract lands. Evidence is kept.
