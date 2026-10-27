---
description: "Task list for the Storage Gate consumer feature (004)"
---

# Tasks: Storage Gate

**Input**: `specs/004-storage-gate/spec.md`, `plan.md`

**Rules**: tests before implementation in every task; one commit per task with `[ai]`; push after
each commit; `Makhzan.sol` untouched; local only (no deploy, no key, no RPC).

## Phase 1 — Specification (done)

- [x] **T001** Pin `healthOf` semantics: `contracts/test/makhzan/HealthSemantics.t.sol` (5 tests)
      and `docs/V3-GOTCHAS.md` §11. Commit `921a0e0`.
- [x] **T002** Short-form spec: `specs/004-storage-gate/spec.md`. Commit `2338172`.
- [x] **T003** Short-form plan: `specs/004-storage-gate/plan.md`. Commit `aa7a4e9`.
- [x] **T004** This task list.

## Phase 2 — Guard (P1)

- [x] **T005** `MakhzanGuard.t.sol` first (truth table: codes 0/1/2/3, expired-healthy, both
      boundaries, exact errors), then `contracts/src/makhzan/MakhzanGuard.sol`.
      Red run → green run → commit (`feat(makhzan): add MakhzanGuard ...`).

## Phase 3 — Gate (P1/P2)

- [x] **T006** `StorageGateLock.t.sol` first, then `lock` in `contracts/src/makhzan/StorageGate.sol`:
      one lock per deal, zero payee/value refused, not-healthy refused.
- [x] **T007** `StorageGateRelease.t.sol` first, then `release`: payee-only, healthy-only, state
      before send, one payment, double release refused.
- [x] **T008** `StorageGateRefund.t.sol` first, then `refund`: payer-only, `healthOf == 3` or
      `block.number >= endBlock` with no release, one payment, double refund refused.

## Phase 4 — Evidence (SC-003, SC-004)

- [ ] **T009** `StorageGateFuzz.t.sol`: release and refund invariants over block offset and role;
      update `contracts/.gas-snapshot`; record `forge build --sizes`, runtime bytes and a gas table
      in `evidence/raw/t1/90-*`.

## Phase 5 — Docs and close-out

- [ ] **T010** README "Using Makhzan from your contract": 10-line example, the honest note that
      `healthOf == 1` means "no open challenge", not "the file is stored", and links to the guard.
      Run the full local gate, commit, then write `CHECKPOINT-GATE.md` to the sync folder.

## Status vocabulary

`done` = committed and green; `in progress` = branch work started; `blocked` = waiting on an owner
decision or an external dependency. A task is never `done` on assumption.
