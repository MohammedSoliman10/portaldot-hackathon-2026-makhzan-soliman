# Tier 1 results — `002-core-storage-proofs`

**Status**: local evidence only. Every number below comes from anvil on `127.0.0.1:8549`
(chain id `420420777`) with anvil's public default accounts. No live RPC was called, no contract was
deployed, no real key was used. Rows marked `[pending live run]` have not run on the live chain and
must not be read as results.

**Raw evidence**: `evidence/raw/t1/48-e2e-local.txt` (full run), `59-daemon-evidence-green.txt`
(daemon suite + re-run), `49-size-check.txt`, `50-size-check-red.txt`, `51-gas-snapshot.txt`,
`52-ci-local.txt`, `54-evidence-green.txt`, `55-secret-scan.txt`, `56-scope.txt`,
`57-final-local.txt`, `60-deploy-red.txt`, `61-deploy-green.txt`, `62-entrypoints-red.txt`,
`63-entrypoints-green.txt`, `64-e2e-process.txt`, `65-gate-b7.txt`.

## What ran

| Item | Value |
| --- | --- |
| Network | local anvil, `http://127.0.0.1:8549`, chain id `420420777` |
| Contract | `Makhzan` at `0x5fbdb2315678afecb367f032d93f642f64180aa3` (local anvil deploy, not deployed anywhere) |
| Compiler | solc `0.8.28`, evm `paris`, optimizer runs `1`, `via_ir = true` (DR-012) |
| File | 1 MiB, 1,024 blocks of 1,024 B |
| Root | `0x3bb74aa75b7de7d472983940cc20bf821a9b222b8d2dd58dfce541928a36f7b8` |
| Deal | id 1, provider 1, price 1,000,000,000,000,000 units, bond 10,000,000,000,000,000 units, slash 2,000 bps |
| Unit price | `WEI_PER_UNIT = 10,000` wei `[assumption]` until G07 is measured |

## Round 1 — answered, passed (SC-001)

| Step | Tx hash | Block | Status |
| --- | --- | --- | --- |
| challenge | `0xe6fff2362993d544303246aef9226e590a6b9efbff9b4d09c579a74caa8fec38` | 4 | success |
| answer (index 54, path length 10) | `0xd64e51e45c08c6701b4d12879be451cb57b724c875d403e2543324c015527068` | 5 | success |

Read-back: `challengeStateOf(1).open = false`. Provider bond before and after
`10,000,000,000,000,000` units — a pass costs the provider nothing but gas.

## Round 2 — deliberately unanswered, slashed (SC-002)

| Step | Tx hash | Block | Status |
| --- | --- | --- | --- |
| challenge (index 58) | `0xfb76e56babe0461c6d57a767bd418cfb89054fb9f9b9b01d3df16d93a9ba2d18` | 6 | success |
| resolve, after a 10-block window | `0x6f835f73df96d577fb472286b6a928dff1aa4dfec0dc001991442574b0c2e400` | 18 | success |

The provider daemon skipped the answer on purpose (`drill: "skip"`), so the round was still open at
the deadline. Read-back after `resolve`: provider bond `10,000,000,000,000,000` →
`8,000,000,000,000,000` units (exactly 2,000 bps, 20%), deal owner balance
`9,989,996,767,439,178,360,684` → `10,009,996,767,439,178,360,684` wei, credit
`20,000,000,000,000,000,000` wei (= slash × `WEI_PER_UNIT`, gas-free to the owner because `resolve`
already paid for it). The daemon's own record only became `failed` after that read-back
(`daemonStatusAfterResolve: "failed"`), never from the skipped send.

## Settle

| Step | Tx hash | Block | Status |
| --- | --- | --- | --- |
| settle (stranger account) | `0x8de3cea6e509b43fe8b43f14723da1ac7d9786cc36993fb159c01991c3ea5faf` | 55 | success |

Provider balance `9,899,999,695,509,565,813,977` → `9,909,999,695,509,565,813,977` wei (credit
`10,000,000,000,000,000,000` wei = price × `WEI_PER_UNIT`), `claimed = 1,000,000,000,000,000`
(= the whole price, so `claim` afterwards reverts `AlreadySettled`), `accrued.claimable = 0`,
settled flag `1`.

## Size budget

| Measurement | Bytes | Budget | Margin |
| --- | --- | --- | --- |
| `Makhzan` runtime (deployed) | 6,378 | 10,240 | 3,862 |
| `Makhzan` creation | 6,966 | — | — |

Measured with `via_ir = true` (DR-012); `scripts/check-size.mjs` exits 1 one byte over budget
(`50-size-check-red.txt`). Storage slots: config 1, provider 2, deal 3, active challenge 0 extra,
0 growth per round — `StorageLayout.t.sol`.

## Gas snapshot (local)

`forge snapshot --check` exits 0. Representative success-path rows from `contracts/.gas-snapshot`:
challenge 206,955 (`test_challengeRecordsIndexDeadlineAndPathLength`), answer 983,069 before the
deadline / 2,571,840 at the end block (`test_answerBeforeDeadlinePasses`,
`test_answerAfterEndBlockButBeforeDeadlinePasses`), resolve with a 20% slash 322,736
(`test_ownerResolveAfterDeadlineSlashesTwentyPercentToOwner`), claim at the exact end block 289,607,
settle 219,416 (claimed-before-pay path) / 306,616 (pays accrued). These are local Foundry gas
numbers, not a live fee estimate.

## Tests

| Suite | Result |
| --- | --- |
| Foundry | 21 suites, 144 tests, 0 failed |
| Fuzz | 8 × 1,000 runs, 0 failed |
| Invariants | 6 × 256 runs × 50 depth (12,800 calls), 0 violations |
| TypeScript | 93 tests, 0 failed; `tsc --noEmit` clean |
| Vector parity | `contracts` and `apps/makhzan` copies agree with the golden vectors |
| CI command list | 10/10 commands exit 0 locally (`52-ci-local.txt`) |

## Batch 7 — deploy command, entry points and process e2e (local only)

| Item | Result | Evidence |
| --- | --- | --- |
| Deploy command | dry run prints a tPOT estimate and sends nothing; below-reserve and unset-network refusals; anvil deploy record checked against the chain | `60-deploy-red.txt`, `61-deploy-green.txt` |
| CLI / daemon entry points | explicit network, env-only key, viem wiring, `resolve`, graceful stop, five-state logs | `62-entrypoints-red.txt`, `63-entrypoints-green.txt` |
| Process-level e2e | separate deploy, daemon and CLI processes; pass round then claim/settle; skip drill, `resolve` after the deadline | `64-e2e-process.txt` |
| Slash check | bond `10,000,000,000,000,000 -> 8,000,000,000,000,000` units; owner credited `20,000,000,000,000,000,000` wei (slash × `WEI_PER_UNIT`) | `64-e2e-process.txt`, `evidence/deployments/` |
| Full gate | Foundry 144, makhzan 93, gates 45, size 6,378 B, snapshot check, except one pre-existing false positive in `specs/001-tier0-gates/tasks.md` | `65-gate-b7.txt` |

## Not done — `[pending live run]`

| Item | Status |
| --- | --- |
| Live deployment and address | `[pending live run]` — BLOCKED on G02 (chain parameters) |
| Live register/challenge/answer/resolve/settle | `[pending live run]` — BLOCKED, no live evidence exists |
| Live fee schedule (G05) and `WEI_PER_UNIT` confirmation (G07) | `[pending live run]` — BLOCKED |
| Retrieval window / block-time behaviour on the live chain | `[pending live run]` — BLOCKED |
| Live runbook | `docs/live-runbook.md` (commands only, nothing executed) |

The live plan is in `docs/live-runbook.md`. Nothing in this file may be copied into a live evidence
folder without replacing every local hash and number with the live one.
