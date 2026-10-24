# Live runbook — Tier 1

**Feature**: `002-core-storage-proofs`. LIVE-1 (read-only preparation and one free `--dry-run`) is
**done**; LIVE-2 (the transactions) is **not started**. No live transaction has been sent from this
repository. Every live row below is `[pending live run]` until its own evidence file exists.

## LIVE-1 results (executed 2026-10-24, no transaction)

| Item | Result | Evidence |
| --- | --- | --- |
| Key wrapper | `scripts/with-live-env.sh <owner\|provider-1> -- <cmd>`; 6 tests pass; the key is exported only to the child, never printed, written or on argv | `104-live-env-red.txt`, `105-live-env-green.txt` |
| Owner, live read-only | chain `420420777`, account `0x0948EBD7637D1C32858a6FC5D947E85A6600205C`, balance `729.279359108146266225 tPOT`; mapping and contract code fail as expected before a deploy | `108-doctor-owner-live.txt` |
| Provider-1, live read-only | same chain, balance covers the `30 tPOT` bond plus fees; not yet registered | `109-doctor-provider1-live.txt` |
| Free dry run | `--dry-run` of the real creation tx: estimate `538.123540 tPOT`; ratio `0.984608251872`; projected `529.840878011 tPOT`; owner after `199.438481098 tPOT`; reserve check passed | `110-live-dry-run.txt` |
| Calibration shape | the Tier 0 file is copied verbatim; the reader accepts `makhzan_projection.measured_ratio` | `106-calibration-shape-red.txt`, `107-calibration-shape-green.txt` |
| Registration path | the CLI had no `register` command while the doctor printed one; added test-first | `111-register-red.txt`, `112-register-green.txt` |

The dry run is **not** a deploy and **not** a G02 PASS: `eth_estimateGas` executed the `via_ir`
creation bytecode in simulation and accepted it, which is the free pre-check only.

## Gate (DR-013) — replaces the old T063 gate

DR-013 closed Tier 0 probe spending at `70.63305145206221 tPOT` of the `100 tPOT` cap. The gate is
now split into what is **verified** (free, before any transaction) and what is **measured on the real
contract** (after the deploy). There is no probe deploy.

| # | What | Status | Proof | If missing or failing |
| --- | --- | --- | --- | --- |
| G01 | Chain id, RPC and block production | **verified** | Tier 0 T026; re-observed in `108`/`109`/`110` | STOP if the chain id is not `420420777` |
| G02 | The live EVM accepts the `via_ir` creation bytecode | **partial by design** | `eth_estimateGas` succeeded in `110`; the deploy tx is the remaining proof | STOP if the deploy estimate fails — do not fall back to non-IR without a decision record |
| G03 | Deployed runtime equals the artifact | **measured after deploy** | `verify:deployment` byte-for-byte `eth_getCode` | STOP if any byte differs; record the first differing offset |
| G04 | Block size and block time | **measured after deploy** | the 1 MiB deal (1,024 leaves at 1,024 B) and the challenge blocks | STOP if the deal cannot use 1,024 B blocks |
| G05 | Fee schedule and storage deposit | **measured after deploy** | balance drop vs the estimate, in `evidence/calibration.json` style | STOP if the measured ratio leaves the 10% band |
| G07 | Implied factor | **verified** | Tier 0 T026: factor `10000`, `WEI_PER_UNIT = 10_000` | STOP if a live read disagrees |
| Funding | Owner and provider-1 hold the planned tPOT | **verified for the dry run only** | `108`, `109` | STOP if either balance is below the planned need |
| Calibration | Measured deploy ratio is present and positive | **verified** | `evidence/calibration.json`, ratio `0.984608251872` | STOP if the file is absent or ratio-less |
| Secrets | No key in an artifact, log, argv or commit | **verified** | wrapper tests, `secret-scan` on every evidence file, `sanitization` scan | STOP and rotate |

Gate verdict for the transaction run goes to `evidence/raw/t1/58-live-gate.txt` with the UTC time and
each verdict quoted. Re-run the two doctors and the free dry run **immediately before** the deploy;
the LIVE-1 estimate is not reused if the chain moved.

## LIVE-2 — exact commands

All commands run from the repository root. The wrapper sets
`MAKHZAN_NETWORK=live`, `MAKHZAN_RPC_URL=https://test-evm-rpc-v3.portaldot.dev` and
`MAKHZAN_CHAIN_ID=420420777`, and loads **one** key (`OWNER_KEY` or `PROVIDER_1_KEY`) as
`MAKHZAN_PRIVATE_KEY`. It never prints a value and never puts a key on argv.

### Step 0 — gate re-check (read-only, free)

```bash
MAKHZAN_ED_TPOT=566.518509593496 MAKHZAN_GAS_TPOT=100 \
  scripts/with-live-env.sh owner -- node apps/makhzan/src/doctorMain.ts
MAKHZAN_ED_TPOT=0 MAKHZAN_DEPOSITS_TPOT=30 MAKHZAN_GAS_TPOT=1 \
  scripts/with-live-env.sh provider-1 -- node apps/makhzan/src/doctorMain.ts

scripts/with-live-env.sh owner -- node scripts/deploy.mjs --dry-run \
  --min-bond 10000000000000000000 \
  --window 50 --block-size 1024 --slash-bps 2000 \
  --min-duration 100 --max-duration 100800
```

Expected (LIVE-1): `calibration: measured ratio 0.984608251872`, estimate about
`538.123540 tPOT`. **Abort** if the chain id differs, either balance is below its need, the estimate
fails, or the estimate is above the deploy cap.

### Step 1 — deploy (one transaction)

Dry run again (same command, immediately before):

```bash
scripts/with-live-env.sh owner -- node scripts/deploy.mjs --dry-run \
  --min-bond 10000000000000000000 \
  --window 50 --block-size 1024 --slash-bps 2000 \
  --min-duration 100 --max-duration 100800

scripts/with-live-env.sh owner -- node scripts/deploy.mjs \
  --min-bond 10000000000000000000 \
  --window 50 --block-size 1024 --slash-bps 2000 \
  --min-duration 100 --max-duration 100800
export MAKHZAN_CONTRACT=<address from the deployment record>
```

Then verify the code and the address:

```bash
MAKHZAN_NETWORK=live MAKHZAN_RPC_URL=https://test-evm-rpc-v3.portaldot.dev \
  MAKHZAN_CHAIN_ID=420420777 \
  node apps/makhzan/scripts/verify-deployment.mjs --address "$MAKHZAN_CONTRACT"
MAKHZAN_NETWORK=live MAKHZAN_RPC_URL=https://test-evm-rpc-v3.portaldot.dev \
  MAKHZAN_CHAIN_ID=420420777 scripts/with-live-env.sh owner -- \
  node apps/makhzan/src/doctorMain.ts
```

Record `evidence/raw/t1/59-live-deploy.txt`: chain id, deployer, address, tx hash, block, status,
finality, gas used, estimate, measured balance drop, ratio, runtime/creation bytes, the
`verify-deployment.json` digest, and the read-back of slot 0. **Abort** on a revert, an address
mismatch, a byte mismatch, or a measured cost above the cap.

### Step 2 — register provider-1 (one transaction, 30 tPOT bond)

```bash
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh provider-1 -- npm --prefix apps/makhzan run cli -- register --bond 30
MAKHZAN_ED_TPOT=0 MAKHZAN_DEPOSITS_TPOT=30 MAKHZAN_GAS_TPOT=1 \
  scripts/with-live-env.sh provider-1 -- node apps/makhzan/src/doctorMain.ts
```

Record `evidence/raw/t1/62-live-register.txt`: tx hash/block/status, provider id, bond in units and
wei, balance before/after, and the doctor's mapping line (now `ok`).

### Step 3 — start the daemon (no transaction)

```bash
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" MAKHZAN_PROVIDER_ID=1 \
  MAKHZAN_STATE_DIR="$PWD/evidence/state/live" \
  scripts/with-live-env.sh provider-1 -- npm --prefix apps/makhzan run daemon &
echo $! > evidence/state/live-daemon.pid
```

The daemon logs the five labels every poll; the state file is evidence and is never edited by hand.

### Step 4 — upload the 1 MiB file and create deal A

```bash
dd if=/dev/urandom of=demo-1mib.bin bs=1024 count=1024
sha256sum demo-1mib.bin
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh owner -- npm --prefix apps/makhzan run cli -- upload "$PWD/demo-1mib.bin" --provider 1
```

Take `root`, `size` and `leafCount` from the upload record (1,048,576 B / 1,024 B = 1,024 leaves).

```bash
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh owner -- npm --prefix apps/makhzan run cli -- create \
  --root <root> --size 1048576 --leaf-count 1024 --provider 1 --duration 150 --price 5
```

Deal A is id `1`. Record `evidence/raw/t1/60-live-pass.txt` and the upload root/hash.

### Step 5 — challenge A, daemon answers, passed round

```bash
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh owner -- npm --prefix apps/makhzan run cli -- challenge 1
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh owner -- npm --prefix apps/makhzan run cli -- watch 1
```

Expect `passed` with an unchanged bond. Record the round record (five statuses), challenge/answer
hashes and blocks, the read-back and the bond before/after. **Abort** if the daemon reports
`unanswered`, the bond moved, or a read-back disagrees with the receipt.

### Step 6 — deal B, daemon in skip mode, slashed round

Restart the daemon in skip mode (stop the old process first, record both PIDs):

```bash
kill "$(cat evidence/state/live-daemon.pid)"
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" MAKHZAN_PROVIDER_ID=1 \
  MAKHZAN_DRILL=skip MAKHZAN_STATE_DIR="$PWD/evidence/state/live-skip" \
  scripts/with-live-env.sh provider-1 -- npm --prefix apps/makhzan run daemon &
echo $! > evidence/state/live-skip-daemon.pid

MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh owner -- npm --prefix apps/makhzan run cli -- create \
  --root <root> --size 1048576 --leaf-count 1024 --provider 1 --duration 150 --price 5
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh owner -- npm --prefix apps/makhzan run cli -- challenge 2
# wait for the 50-block window, then, permissionless:
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh owner -- npm --prefix apps/makhzan run cli -- resolve 2
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh owner -- npm --prefix apps/makhzan run cli -- claim 2
MAKHZAN_CONTRACT="$MAKHZAN_CONTRACT" \
  scripts/with-live-env.sh owner -- npm --prefix apps/makhzan run cli -- settle 2
```

Deal B is id `2`. `claim` moves the provider bond (not the deal price) and `settle` releases the deal;
run them in that order as above. Record `evidence/raw/t1/61-live-slash.txt`: challenge/resolve hashes
and blocks, bond before/after (exactly 20% down), owner credit in wei, the daemon's `failed` status,
and the claim/settle results.

### Step 7 — refusal snapshot and evidence bundle

```bash
npm --prefix apps/makhzan run evidence:refusals
```

This is the R5 **local anvil** snapshot (read-only `eth_call` against a local chain); it is not a live
claim and its rows stay labelled local. No live refusal runner exists.

The feature 003 bundle is built from the records above and published with the tested
`publishBundle` path (`apps/makhzan/src/evidence.ts`); its validator rejects the 18 documented
failure cases. **No bundle CLI exists yet**, so LIVE-2 must add
`apps/makhzan/scripts/publish-evidence.mjs` (test-first) before this step can run. Until it does,
the bundle row is `[pending live run]` and no bundle is claimed.

Finally:

```bash
node scripts/secret-scan.mjs evidence/raw/t1/*.txt evidence/*.json
git status --short
```

## Spend caps and per-step limits

| Step | Cap | Basis |
| --- | --- | --- |
| Deploy | estimate ≤ `566.518509593496 tPOT`; measured cost ≤ the same | DR-013 high projection |
| Deploy reserve | `100 tPOT` stays after the deploy | the script's reserve check |
| Register provider-1 | `30 tPOT` bond + `1 tPOT` fees = `31 tPOT` | provider-1 holds about `60 tPOT` |
| Deal A | `5 tPOT` price + `1 tPOT` fees = `6 tPOT` | owner |
| Deal B | `5 tPOT` price + `1 tPOT` fees = `6 tPOT` | owner |
| Challenge / resolve / claim / settle | `2 tPOT` total | owner |
| Owner session total | ≤ `729.279359108146266225 − 100 = 629.279359108146266225 tPOT` | LIVE-1 balance minus reserve |
| Provider-1 session total | ≤ `31 tPOT` | bond plus fees |

`--reserve-tpot` or `MAKHZAN_RESERVE_TPOT` may be changed only with a written reason in
`docs/decisions.md`. Never top up from an unaudited wallet.

## Rules that apply to every transaction

- **Dry run first.** The deploy path has an explicit `--dry-run`; every CLI transaction runs
  `eth_estimateGas` before it sends. Record the estimate and, after inclusion, the measured balance
  drop. If the drop is more than 10% above `estimate × 0.984608251872`, STOP and record it; do not
  re-derive the budget by guesswork.
- **Pending record.** The deploy writes
  `evidence/deployments/pending-live-420420777.json` before sending: `"sending"` with no hash
  first, then `"sent"` with the hash. While it exists, a new deploy is refused. If the send response
  is lost, check the owner nonce and the explorer, then `--resume <hash>`; `--force-new` only when the
  pending tx is known dropped, with the reason in the evidence. Never delete the pending file by
  hand.
- **One transaction at a time.** Read the receipt and the read-back before the next command. A
  second live deploy needs a new decision record.
- **No key on argv, ever.** Only `scripts/with-live-env.sh` loads a key; if a key appears in any
  output, stop, rotate it and record the incident.

## Abort rules

- RPC down, chain id mismatch, stalled blocks, or any estimate failure: record the exact error and
  the UTC time, stop, retry later. Do not work around the RPC.
- Estimate above the step cap, balance below the planned need, deploy revert, address mismatch,
  byte mismatch, or a pending record you cannot explain: STOP; do not retry with different flags.
- Daemon `unanswered`, bond moved without a slash, slash not exactly 20%, owner credit not equal to
  `slashUnits × 10_000`, or any read-back that disagrees with the receipt: STOP; keep the state file.
- Never weaken a test or a threshold to make a live run pass. A mismatch is a spec change (decision
  record) or a bug (failing test first).
- If the gate fails after it starts, every remaining live task is written `BLOCKED — <reason>` in
  `evidence/tier1-results.md` and the run stops without another transaction.

## Evidence files for LIVE-2

| File | Content | Label |
| --- | --- | --- |
| `evidence/raw/t1/58-live-gate.txt` | DR-013 gate verdicts, UTC, funding, dry run | `[live check]` |
| `evidence/raw/t1/59-live-deploy.txt` | Deploy record, verify digest, measured deposit | `[live run]` |
| `evidence/raw/t1/62-live-register.txt` | Registration tx, bond, mapping | `[live run]` |
| `evidence/raw/t1/60-live-pass.txt` | Passed round and read-back | `[live run]` |
| `evidence/raw/t1/61-live-slash.txt` | Slashed round, bond delta, owner credit | `[live run]` |
| `evidence/receipts/live/` | Raw receipts written by the CLI/daemon/deploy | `[live run]` |
| `evidence/addresses.json`, `evidence/txs.json` | Derived views only, never hand-edited | `[live run]` |

Every record carries its own UTC timestamp and chain id. Nothing local may be re-labelled live, and
no live number may be inferred from a local one.

## Out of scope

No mainnet, no token, no vault, no agent, no UI, no replication/repair, no permissionless challenges,
no second deployment for the same feature.
