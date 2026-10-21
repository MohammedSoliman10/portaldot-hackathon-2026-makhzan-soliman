# Size and Slot Budget Contract

**Feature**: `002-core-storage-proofs` | **Enforced by**: `.github/workflows/ci.yml`

## Budget file

`contracts/size-budget.json`:

```json
{
  "runtimeBytes": 10240,
  "dealSlots": 3,
  "providerSlots": 2,
  "activeChallengeExtraSlots": 1,
  "challengeRoundGrowthSlots": 0,
  "source": "spec FR-036; re-set from G05 before the [LIVE] phase"
}
```

## Runtime check

`scripts/check-size.mjs`:

1. read `contracts/out/Makhzan.sol/Makhzan.json`;
2. take `.deployedBytecode.object`, strip `0x`, halve the hex length = deployed runtime bytes;
3. compare with `runtimeBytes`;
4. exit 0 with `Makhzan runtime 8926 B <= budget 10240 B (margin 1314 B)`, or exit 1 with the actual
   and budgeted numbers and the overrun.

The CI contract job runs `forge build --sizes` then `node scripts/check-size.mjs`, so a size
regression fails the build before tests are read.

## Slot checks

`contracts/test/makhzan/StorageLayout.t.sol`:

- assert the two fixed config slots exist once at deployment (≈ 7.8 tPOT estimate, part of the
  deploy budget, not a per-operation cost);
- populate one provider and one deal with maximal realistic values;
- compute the provider element slot (`keccak256(uint256(3)) + index`) and assert it is non-zero and
  the next slot is zero (2-slot budget: element + id mapping entry);
- compute the deal slot and assert slots A, B and C are non-zero and slot D is zero (3-slot budget);
- open a challenge and assert the same four slots are unchanged (0 new slots for an active challenge);
- resolve, open a second challenge on the same deal, and assert no new slot appeared
  (0 growth per round).

## Overrun policy

1. The number in `contracts/size-budget.json` is the budget; a change to it is a separate, recorded
   decision, never a silent edit to make a failing build pass.
2. If the implementation cannot meet 10 KB, the commit that raises the budget MUST carry a written
   justification in `plan.md` → Complexity Tracking, a note in `docs/decisions.md`, and the owner's
   approval in the commit message body.
3. Before the `[LIVE]` phase, the runtime number, the slot numbers and the resulting deposit cost are
   re-set from the G05 verdict; the demo's affordability is computed from those numbers and compared
   with the funded balance. If the funded balance is insufficient, the live phase is `blocked` with
   the shortfall stated.

## Baseline

The scratch feasibility skeleton (every planned entry point, nine events, the planned packed layout)
compiled to **8,926 B** runtime and a **3-slot** deal at `optimizer_runs = 1`, `bytecode_hash = none`,
`cbor_metadata = false`, `solc 0.8.28`, `paris`. This is a planning baseline, not a commitment; the
first implementation task reproduces it inside the repository and records it under `evidence/raw/t1/`.
