# Live runbook — Tier 1 (document only, nothing here has been executed)

**Feature**: `002-core-storage-proofs`. This file is the plan for T063–T067. It has **not** been run:
there is no live address, no live transaction and no live number anywhere in this repository. Every
step below is `[pending live run]` until it is executed and its own evidence file exists.

The gate (T063) decides whether any of this may start. If the gate fails, do not deploy and do not
touch the network beyond the read-only checks in step 0.

## Preconditions (T063 — all must be true and recorded)

| # | Check | Where the verdict lives | If missing or failing |
| --- | --- | --- | --- |
| G01 | Chain id, RPC and block production observed | `evidence/raw/t0/` G01 record | STOP — record `BLOCKED — G01 missing` |
| G02 | The live chain accepts the IR bytecode produced by `via_ir = true` (DR-012) | `evidence/raw/t0/` G02 record | STOP — do not deploy; DR-012's bytecode is unproven on that chain |
| G04 | Block size and block time measured | `evidence/raw/t0/` G04 record | STOP — the 1,024 B default (DR-017) is unconfirmed |
| G05 | Fee schedule measured (deploy deposit and per-extrinsic fees) | `evidence/raw/t0/` G05 record | STOP — every tPOT figure stays an estimate (DR-015) |
| G07 | Measured implied factor equals `WEI_PER_UNIT = 10_000` | `evidence/raw/t0/` G07 record | STOP — do not re-scale the unit by guesswork; a mismatch is a spec change, not a config change |
| Funding | Owner accounts hold enough tPOT and can move value | owner's funding evidence | STOP — record the shortfall; never deploy with a partial budget |
| Spending cap | DR-012 planning estimate ≈ 517 tPOT for the deploy, owner budget ≈ 1,500 tPOT across two wallets | `docs/decisions.md` DR-012 | STOP if the measured deposit exceeds the cap; do not top up from an unaudited wallet |
| Secrets | `PROVIDER_KEY` / `OWNER_KEY` exist only in the environment, never in a file, log, argv or commit | `55-secret-scan.txt` (local) plus a fresh scan on the live artifacts | STOP and rotate if any key appears anywhere |

The gate result goes to `evidence/raw/t1/58-live-gate.txt` with the UTC time and each verdict quoted.
`contracts/size-budget.json` is re-set from the G05 numbers in the same commit, and the budget table in
`evidence/tier1-results.md` is updated then — not before.

## Step 0 — read-only preflight (no key needed)

```bash
# Every value is recorded with its UTC timestamp; a failed RPC is recorded verbatim and retried later.
date -u +%Y-%m-%dT%H:%M:%SZ
cast chain-id --rpc-url "$MAKHZAN_RPC_URL"
cast block-number --rpc-url "$MAKHZAN_RPC_URL"
cast block latest --rpc-url "$MAKHZAN_RPC_URL" --json | head -40
cast balance "$OWNER_ADDRESS" --rpc-url "$MAKHZAN_RPC_URL"
cast balance "$PROVIDER_ADDRESS" --rpc-url "$MAKHZAN_RPC_URL"
```

Abort if the chain id differs from the G01 record, if block production is stalled, or if either
balance is below the DR-012 cap. Record the raw output even when it fails.

## Step 1 — deploy (T064)

```bash
cd contracts
forge build --sizes                     # record the runtime/creation bytes for the live build
node ../scripts/check-size.mjs          # must exit 0
# Deploy path: T064 must provide one that reads the key from the environment. The repository does NOT
# contain contracts/script/makhzan/Deploy.s.sol today (the local e2e deploys from the Foundry artifact
# with viem). Do not run a script that does not exist.
node apps/makhzan/scripts/deploy-live.mjs   # [to be written in T064] key from env only
```

**Open gap (recorded, not hidden)**: the quickstart's `forge script script/makhzan/Deploy.s.sol` and
this step name a deploy script that has not been written yet. T064 must either add that script or
replace both references with the environment-keyed viem deploy path; until then no live step may run.

- Wait for `executed: success`, then observe finality (tag or labelled heuristic with its depth),
  then read the contract back (`providerOf`, `dealOf`, `challengeStateOf` on an unknown id).
- Record to `evidence/raw/t1/59-live-deploy.txt`: chain id, deployer address, deployed address, tx
  hash, inclusion block and hash, execution status, finality observation, gas used, measured
  deposit, `forge build --sizes` bytes.
- **Abort** on a reverted deploy, an address read-back that does not match the tx receipt, or a
  deposit above the DR-012 cap. A failed deploy is recorded, not retried with different flags.

## Step 2 — live passed round (T065)

```bash
cd apps/makhzan
export MAKHZAN_RPC_URL=... MAKHZAN_ADDRESS=...   # address from step 1
export PROVIDER_KEY=... OWNER_KEY=...            # env only, never printed
npm run daemon &                                 # poll loop, evidence-based labels
npm run cli -- upload demo.bin --provider 1
npm run cli -- create --root 0x… --size 1048576 --leaf-count 1024 \
  --provider 1 --duration 7200 --price 5
npm run cli -- challenge 1
npm run cli -- watch 1                           # expect "passed", bond unchanged
```

- The daemon records `submitted` with the tx hash and block, then re-reads `challengeStateOf` and the
  provider bond. Only a closed challenge with an unchanged bond is `passed`.
- Record to `evidence/raw/t1/60-live-pass.txt`: the round record (five statuses), challenge and answer
  hashes with blocks and statuses, the read-back, bond before/after, the daemon's status.
- **Abort** if the daemon reports `unanswered`, if the bond moved, or if any read-back disagrees with
  the receipt. Keep the state file; do not delete or edit it.

## Step 3 — live slashed round (T066)

```bash
# restart the daemon in drill mode: wrong answer or skipped answer
MAKHZAN_DRILL=skip npm run daemon &
npm run cli -- challenge 1
npm run cli -- watch 1                           # expect "failed" only after the read-back
# after the window, anyone may resolve:
# resolve is permissionless; run it through the CLI/script path that reads the key from the
# environment, so the key never appears on a command line:
npm run cli -- resolve 1
npm run cli -- claim 1
npm run cli -- settle 1
```

- Record to `evidence/raw/t1/61-live-slash.txt`: challenge hash/block, resolve hash/block, bond
  before/after (exactly 20% down), owner credit in wei (slash × `WEI_PER_UNIT`), the daemon's
  `failed` status after the read-back, then claim/settle results.
- **Abort** if the slash is not exactly 20%, if the owner credit differs from the computed value, or
  if the daemon claims `failed` before the read-back. Do not "fix" a mismatch by changing the test.

## Key rule

Keys are read from the environment at run time and are never passed as a command-line argument, never
echoed, never written to a file or a log, and never committed. That is why the resolve step uses the
CLI path above rather than a raw signing command: no key flag appears anywhere in this runbook, and
none may be added to it. If a key appears in any output, stop, rotate it, and record the incident.

## Evidence labels and files

| File | Content | Label |
| --- | --- | --- |
| `58-live-gate.txt` | Each precondition verdict, UTC time, funding | `[live check]` |
| `59-live-deploy.txt` | Deploy record, five statuses, address, size, deposit | `[live run]` |
| `60-live-pass.txt` | Passed round record and read-back | `[live run]` |
| `61-live-slash.txt` | Slashed round record, bond delta, owner credit | `[live run]` |
| `evidence/tier1-results.md` | Live section appended; `BLOCKED` rows replaced only where evidence exists | `[live run]` |
| `README.md` | Live rows updated only from the files above | `[live run]` |

Every live record carries its own UTC timestamp and the chain id. Nothing local may be re-labelled
live, and no live number may be inferred from a local one.

## Abort and failure rules

- Record the exact error and the UTC time, then stop. An RPC outage is retried later, not worked
  around.
- Never weaken a test or a threshold to make a live run pass. A mismatch is either a spec change
  (recorded in `docs/decisions.md`) or a bug (fixed with a failing test first).
- A second live deployment needs a new decision record; patrol/re-deploy loops are out of scope.
- If the gate fails at any point, every live task is written as `BLOCKED — <reason>` in
  `evidence/tier1-results.md` and the run stops without deploying.

## Out of scope for this runbook

No mainnet, no token, no vault, no agent, no UI, no replication/repair, no permissionless challenges,
no second deployment for the same feature.
