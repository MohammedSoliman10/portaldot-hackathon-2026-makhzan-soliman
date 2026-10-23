# CHECKIN — Makhzan

## One-line pitch

Makhzan lets a client prove what a storage provider actually held, challenge a missing block, and get
paid back automatically from the provider's bond — on Portaldot, with no trusted middleman.

## Problem

A storage deal is a promise about bytes the client cannot see. Today the client either trusts the
provider or runs an expensive audit. On-chain settlement of "did you keep block 7?" needs a compact
commitment, a bounded challenge window, a verifiable answer, and a slash that pays the wronged client.

## Solution

1. The provider commits to a Merkle root over fixed-size blocks of the file (`createDeal`).
2. The client can open one challenge per deal (`challenge`); the contract picks the block index.
3. The provider answers with the block bytes and a Merkle path (`answer`), or misses the deadline.
4. A miss is resolved by anyone (`resolve`): exactly `slashBps` of the bond is slashed and credited to
   the deal owner. A passed challenge closes normally; `settle` releases the remaining accrual.
5. Other contracts gate on availability through `healthOf(dealId)` (0 unknown/settled, 1 healthy,
   2 challenge pending, 3 in default) instead of decoding deal storage.

Every step is a contract event and a CLI/daemon record; the evidence bundle is a versioned JSON file
that a web app can render even when the RPC is down.

## Portaldot relevance

Portaldot targets affordable, EVM-compatible storage-adjacent applications. Makhzan is a native-unit
(planck) settlement primitive with a small runtime (6,566 B), no external dependencies at runtime and
a deploy path that is exercised on anvil today and prepared for the live testnet. The evidence layer
is designed to make "reported, never measured" claims explicit, which matters when a chain is new and
RPC reliability is uneven.

## What works now (local only)

- Merkle block commitment, shared by Solidity and TypeScript (golden vectors, leaf counts 1, 3, 7, 1000).
- Provider registration and bond; deal creation with exact unit accounting.
- Challenge → answer → resolve → settle, including the 20% slash and exact owner credit on anvil.
- `healthOf` availability view with every state and window boundary tested.
- CLI, daemon and deploy write the raw tx/receipt layer and derived evidence views.
- Byte-for-byte deployment verification (`verify:deployment`) and decoded refusal evidence
  (`evidence:refusals`).
- Read-only `doctor` with an exact fix per failed check.
- 150 Foundry tests, 117 + 45 + 3 TypeScript tests, gate and process-level e2e green (see
  `evidence/raw/t1/`).

## What is not claimed

- **No live deployment, live round, live fee, live block time, or live gas number exists.** Every live
  row is `[pending live run]`.
- No explorer source verification; the local fixture records `sourceVerified: false`.
- No audit. No per-deal bond. No proof of distinct copies. No pull-payment escrow.
- A passed challenge proves possession of one block at one moment, not continuous storage.
- The challenge index uses the D5 fallback; it is not a proven randomness beacon.
- Identical blocks are interchangeable by design: the leaf commits bytes, not position.
- The `resolc`/Portaldot IR deployment path is simulated only (Tier 0 gates).

## Outstanding items

| Item | State |
| --- | --- |
| G01/G02 (IR bytecode + resolc path) | blocked on owner verdicts |
| G04 (block size) / G05 / G07 | blocked on owner verdicts |
| Funding evidence for the live deploy | not supplied |
| Calibration probe and `evidence/calibration.json` | not run (needs a live probe) |
| T063 gate verification, T064 deploy, T065/T066 rounds | `[pending live run]` |
| Live evidence bundle and testnet addresses | `[pending live run]` |

## Form-ready answers

- **Project name**: Makhzan.
- **One-sentence overview**: A challenge-based storage-proof settlement contract with a local-first
  CLI, daemon and versioned evidence bundle, ready for the Portaldot testnet.
- **Current progress**: local implementation complete and green (contract, CLI, daemon, deploy,
  evidence, verification, refusals, doctor); live deployment and live rounds are pending the owner's
  gate verdicts and funding.
- **Outstanding items**: the live gate verification, calibration probe, deploy, and the passed and
  slashed live rounds; no audit or explorer verification is claimed.
- **Testnet deployment details**: `[pending live run]` — address, tx hash, block, chain id and fee
  will be recorded in `evidence/deployments/` and the evidence bundle at that time.

## Demo flow (3 minutes)

1. `forge test` summary and `node scripts/check-size.mjs` (6,566 B ≤ 10,240 B).
2. Start anvil, deploy, register provider, upload a file, create a deal.
3. Challenge; the daemon answers; show the passed round and unchanged bond.
4. Second deal with the daemon in skip mode; `resolve` after the deadline; show exactly 20% slashed
   and the owner credited.
5. `doctor` and `verify:deployment` output; open the evidence bundle and the refusals file.

## Next proof milestone

A live Portaldot testnet deploy followed by one passed and one slashed round, with the gas, fee,
block time and receipt hashes recorded in the evidence bundle — replacing every `[pending live run]`
row with a measured value.
