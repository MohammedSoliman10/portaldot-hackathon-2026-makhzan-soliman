# Demo script — 3 minutes

**Feature**: `002-core-storage-proofs` | **Runs**: local anvil only. No live RPC, no funded key.

Two paths, same result. **Path A** (about 90 s) is the one to present; **Path B** is the manual
walkthrough from `quickstart.md` if the audience wants to see each step. Both end at the same local
evidence file, `evidence/raw/t1/48-e2e-local.txt`.

## Before the clock starts (once, ~2 min, not counted)

```bash
cd contracts && forge build --sizes && cd ..    # warm build cache
cd apps/gates && npm ci && cd ../makhzan && npm ci && cd ../..
```

Prerequisites: Foundry 1.8.5 (`forge`, `anvil`), Node 24, the `forge-std` submodule checked out. No
environment variable and no key is needed for either path — anvil's public default accounts are
derived at run time and never printed.

## Path A — the recorded run (90 s)

| Time | Say | Run |
| --- | --- | --- |
| 0:00 | "One contract, one provider, one 1 MiB file. The contract enforces the bond; the daemon does the work." | — |
| 0:10 | "The deployed bytecode is 6,378 bytes against a 10,240-byte budget, checked from the artifact, not from a log line." | `node scripts/check-size.mjs` |
| 0:25 | "The suite is green: contract, fuzz, invariants, TypeScript." | `cd apps/makhzan && npm test` |
| 0:45 | "Now the whole product path on a local chain: upload, create, challenge, answer, challenge again, skip, resolve, settle." | `node scripts/e2e-local.mjs` |
| 1:25 | "Round one passed — the bond did not move. Round two was deliberately skipped and slashed 20%: 10,000,000,000,000,000 → 8,000,000,000,000,000 units, and the owner was credited 20 POT worth of wei. The daemon only labelled it `failed` after reading the slash back." | point at the two round objects in the JSON |
| 1:50 | "Settle paid the provider the price, set `claimed` to the whole price, and left nothing claimable." | point at `settle` in the JSON |
| 2:10 | "This is local evidence. Live deployment and live rounds are `[pending live run]` — the runbook is `docs/live-runbook.md`." | — |
| 2:30 | Questions. | — |

Expected last line:

```
PASS — SC-001 (one passed challenge) and SC-002 (one slashed challenge) on local anvil
```

The command starts its own anvil on `127.0.0.1:8549`, chain id `420420777`, and kills it on exit. If
the port is busy the script fails fast rather than reusing another chain.

## Path B — manual walkthrough (2–3 min, if asked)

```bash
anvil --chain-id 420420777 &                       # local chain, no live funds
export MAKHZAN_RPC_URL=http://127.0.0.1:8545
export PROVIDER_KEY=...                            # burner, local only, never printed, env only
export OWNER_KEY=...

cd contracts && forge script script/makhzan/Deploy.s.sol \
  --rpc-url $MAKHZAN_RPC_URL --broadcast           # key comes from the environment

cd ../apps/makhzan
npm run daemon &                                   # provider daemon answers challenges
npm run cli -- upload demo.bin --provider 1        # 1 MiB demo file
npm run cli -- create --root 0x… --size 1048576 --leaf-count 1024 \
  --provider 1 --duration 7200 --price 5
npm run cli -- challenge 1
npm run cli -- watch 1                             # expect "passed", bond unchanged
npm run cli -- challenge 1                         # restart the daemon in drill mode: wrong answer
npm run cli -- watch 1                             # expect "failed", bond down 20%, owner credited
npm run cli -- claim 1 ; npm run cli -- settle 1
```

This is the same sequence as `specs/002-core-storage-proofs/quickstart.md` §4. Path A automates it so
the three-minute slot is not spent waiting for prompts or typing hashes.

## If something is down

| Symptom | Response |
| --- | --- |
| `anvil` missing | Path A needs it; install Foundry 1.8.5. Do not substitute a public RPC. |
| Port 8549 busy | `E2E_PORT=8550 node scripts/e2e-local.mjs` (the script reads `E2E_PORT`). |
| `check-size.mjs` says "run forge build first" | Run `cd contracts && forge build` once. |
| Any live question | Answer with the tier-1 status: local only, `[pending live run]`, and point at `docs/live-runbook.md`. Never quote a live number. |

## What not to claim on stage

- Do not say "deployed", "live", or quote a live fee, block time or address.
- Do not present the local gas snapshot as a live cost.
- Do not claim continuous storage or per-deal bonds: the limits section of the README is the honest
  statement.
