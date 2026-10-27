# Feature Specification: Storage Gate (consumer contract)

**Feature Branch**: `004-storage-gate`

**Created**: 2026-10-27

**Status**: Draft (short form)

**Input**: User description: a small consumer contract `StorageGate` plus a reusable library
`MakhzanGuard` that shows how another contract reads Makhzan's availability view correctly.

## Why

`healthOf` answers "is there an open challenge?", not "is the file stored?" and not "is the deal
still running?". A consumer that treats `healthOf == 1` as "the file is stored" will pay for an
empty provider slot. This feature ships the smallest useful consumer that does it correctly, plus a
library other contracts can reuse, and tests both against the real `Makhzan` (no mock).

## User Scenarios & Testing

### User Story 1 — A payer locks money that is only released while the deal is healthy (P1)

A payer opens a Makhzan deal, then deposits the payment it wants to make into `StorageGate.lock`,
naming the payee. While the deal is healthy and inside its term, the payee can call `release` and
take the money. If the deal is pending a challenge answer, in default past the deadline, settled,
missing, or past its end block, the payee cannot release.

**Independent Test**: create a real deal on a local Foundry chain, lock against it, move blocks
through every `healthOf` state, and assert the released/refunded flags and balances.

**Acceptance Scenarios**

1. **Given** a healthy deal inside its term, **When** the payer locks `1 ether` for a payee,
   **Then** the gate holds it and reports one lock for that deal id.
2. **Given** a locked deal, **When** the payee releases while `healthOf == 1` and
   `block.number < endBlock`, **Then** the payee receives the amount once and a second release reverts.
3. **Given** a locked deal, **When** release is attempted with `healthOf` 0, 2 or 3, or at or after
   `endBlock`, **Then** it reverts and no value moves.
4. **Given** a lock, **When** anyone other than the recorded payee calls `release`, **Then** it reverts.

### User Story 2 — The payer can recover money when the deal fails or expires (P2)

If the provider defaults (`healthOf == 3`) or the deal reaches its end block without a release, the
payer takes its money back. Nobody else can.

**Acceptance Scenarios**

1. **Given** a lock and an open challenge past its deadline (`healthOf == 3`), **When** the payer
   refunds, **Then** the payer receives the amount once.
2. **Given** a lock and a deal past `endBlock` that was never released, **When** the payer refunds,
   **Then** the payer receives the amount once.
3. **Given** a lock that is already released or already refunded, **When** anyone calls `release` or
   `refund` again, **Then** it reverts and no second transfer happens.
4. **Given** a lock, **When** anyone other than the payer calls `refund`, **Then** it reverts.

### Edge Cases

- Deal id that never existed: `healthOf == 0`, so `lock` reverts `SettledOrNone`.
- Two locks for the same deal id: the second reverts.
- `endBlock == 0` cannot happen for a real deal; a missing deal never reaches the expiry branch.
- Release at exactly `endBlock` is refused (guard requires `< endBlock`); refund is allowed from
  `endBlock` on, so the last block cannot strand the money.
- A payee that reenters `release` in its `receive` sees the released flag already set.
- Zero payee or zero value in `lock` is rejected.

## Functional Requirements

- **FR-001** `MakhzanGuard.isHealthy(IMakhzan makhzan, uint32 dealId)` returns true only when
  `healthOf(dealId) == 1` **and** `block.number < endBlock`, where `endBlock` is the third field of
  `dealOf(dealId)`.
- **FR-002** `MakhzanGuard.requireHealthy` reverts with a distinct error per state: `Pending()`
  (2), `Default()` (3), `SettledOrNone()` (0), `Expired()` (1 but `block.number >= endBlock`).
- **FR-003** `StorageGate.lock(uint32 dealId, address payee) payable` stores payer, payee and
  amount, one lock per deal id, and reverts unless the deal is healthy now.
- **FR-004** `StorageGate.release(uint32 dealId)` is payee-only, requires the guard to say healthy,
  marks the lock released before sending, and pays exactly once.
- **FR-005** `StorageGate.refund(uint32 dealId)` is payer-only and allowed only when
  `healthOf == 3`, or when `block.number >= endBlock` and nothing was released; it marks the lock
  refunded before sending and pays exactly once.
- **FR-006** No admin, no owner, no upgrade path. The Makhzan address is an immutable constructor
  argument.
- **FR-007** `StorageGate` runtime stays under 1,500 B if achievable; if not, the measured size is
  reported rather than the feature trimmed.

## Key Entities

- **Lock**: `payer` (address), `amount` (uint96 wei), `payee` (address), `status`
  (0 none, 1 locked, 2 released, 3 refunded), keyed by Makhzan `dealId`.

## Success Criteria

- **SC-001** All new tests pass against a real `Makhzan` deployment in Foundry; no mock of the
  health view exists in the suite.
- **SC-002** Tests cover `healthOf` 0, 1, 2, 3, the expired-healthy case, double release, wrong
  caller on both paths, and both refund routes.
- **SC-003** A fuzz test finds no successful release unless `healthOf == 1 && block.number < endBlock`.
- **SC-004** The runtime size and a gas table are recorded in the checkpoint; a README section shows
  a 10-line integration example and states the honest limit of `healthOf`.

## Out of scope

- Deploying `StorageGate` anywhere, any live transaction, any change to `Makhzan.sol`.
- Multiple locks per deal, partial release, multiple payees, fees, pausing, upgrades.
- A TypeScript client or UI for the gate.
