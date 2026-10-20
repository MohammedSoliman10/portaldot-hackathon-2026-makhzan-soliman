# Quickstart: prove Core Storage Proofs locally, then live

**Feature**: `002-core-storage-proofs` | **Plan**: [plan.md](./plan.md)

Every step below runs on a local chain first. The live section is the only part that touches the
Portaldot testnet and it is gated on the Tier 0 verdicts and owner funding.

## Prerequisites

- Foundry `1.8.5` (`forge`, `cast`, `anvil`) on PATH.
- Node `24.20.0` and npm.
- The repository cloned, with the `forge-std` submodule initialised:
  `git submodule update --init --recursive`.
- For the live section only: a funded burner key in an environment variable and the Tier 0 verdicts
  recorded in `evidence/`. No key is ever passed on a command line.

## 1. Install and build

```bash
cd contracts && forge build --sizes        # prints the Makhzan runtime size
cd ../apps/makhzan && npm ci && npm run typecheck
```

Expected: `forge build` succeeds and `Makhzan` is at or below the budget in
`contracts/size-budget.json`; the size script passes:
`node scripts/check-size.mjs` prints the actual and budgeted bytes.

## 2. Contract tests, fuzz, invariants and the snapshot

```bash
cd contracts
forge fmt --check
forge test -vvv                            # unit + fuzz, including the shared golden vectors
forge test --match-path 'test/makhzan/invariant/*' -vvv
forge snapshot --check
```

Expected: all suites pass; the invariant suite reports zero violations; the snapshot matches the
committed `.gas-snapshot`. The red output of each test is kept under `evidence/raw/t1/` from the
commit that introduced it, and is written **before** the corresponding implementation.

## 3. Shared golden vectors

```bash
node packages/merkle-vectors/generate.ts --check
node packages/merkle-vectors/generate.ts           # only if the scheme changes on purpose
cd apps/makhzan && npm test                        # TypeScript side recomputes roots and paths
```

Expected: the committed `vectors.json` matches the generator; the TypeScript and Solidity tests
agree on roots and every path for leaf counts 1, 3, 7 and 1000.

## 4. Local end-to-end: one pass and one slash

```bash
anvil --chain-id 420420777 &                       # local chain, no live funds
export MAKHZAN_RPC_URL=http://127.0.0.1:8545
export PROVIDER_KEY=0x...                          # burner, local only, never printed
export OWNER_KEY=0x...

cd contracts && forge script script/makhzan/Deploy.s.sol \
  --rpc-url $MAKHZAN_RPC_URL --broadcast          # key supplied by the environment, not argv

cd ../apps/makhzan
npm run daemon &                                   # provider daemon answers challenges
npm run cli -- upload demo.bin --provider 1        # 1 MiB demo file
npm run cli -- create --root 0x.. --size 1048576 --leaf-count 1024 \
  --provider 1 --duration 7200 --price 5           # escrow paid with msg.value
npm run cli -- challenge 1                         # random index, 50-block window
npm run cli -- watch 1                             # provider answers; expect "passed", bond unchanged

npm run cli -- challenge 1                         # restart the daemon in drill mode: answer wrong
npm run cli -- watch 1                             # expect "failed", bond down 20%, owner credited
npm run cli -- claim 1 ; npm run cli -- settle 1
```

Expected: the first round passes with an unchanged bond; the second fails and slashes exactly 20% of
the bond, paid to the owner; every transaction carries the five statuses and a state read-back. A
shorter window can be deployed for the timed demo; record the deployment parameters with the evidence.

## 5. Budgets

```bash
cd contracts && forge inspect Makhzan storage-layout
node scripts/check-size.mjs
```

Expected: the storage layout matches `contracts/storage-layout.md`; the size check passes; the
per-operation budget table in `evidence/tier1-results.md` shows 3 slots per deal, 2 per provider and
0 new slots per challenge round.

## 6. Live (gated)

Only after: G01 (deploy/call), G02 (compiler pin), G04 (block size) and G05 (deposit numbers) have
verdicts, and the owner account is funded with enough tPOT to cover the deployment and the demo
records.

```bash
export MAKHZAN_RPC_URL=https://test-evm-rpc-v3.portaldot.dev
node scripts/check-size.mjs                        # same budget locally as live
cd apps/makhzan && npm run cli -- create ... && npm run cli -- challenge ... && npm run cli -- watch ...
```

Expected: one passed challenge and one slashed challenge, each with a transaction reference,
inclusion block, execution result, finality observation and state read-back, recorded under
`evidence/raw/t1/` and summarised in `evidence/tier1-results.md`. If the RPC, the funds or a gate
verdict is missing, the live item is recorded as `BLOCKED — <reason>`, never as done.

## 7. Reproduce the demo in under 3 minutes

The README's demo script is the canonical short version: start `anvil`, deploy, register provider,
upload the 1 MiB file, create the deal, pass one challenge, fail one challenge (drill mode), show the
bond delta and the transaction hashes, settle. It follows this quickstart without undocumented steps.
