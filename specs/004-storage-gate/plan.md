# Implementation Plan: Storage Gate

**Branch**: `004-storage-gate` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/004-storage-gate/spec.md`

## Summary

Two new Solidity files, no change to `Makhzan.sol`:

1. `contracts/src/makhzan/MakhzanGuard.sol` — a library with `isHealthy` and `requireHealthy`.
   It joins the two facts that matter: `healthOf(dealId) == 1` (no open challenge) **and**
   `block.number < endBlock` from `dealOf(dealId)` (the deal is still inside its term). Four custom
   errors name the reason for a refusal.
2. `contracts/src/makhzan/StorageGate.sol` — ~1.2 KB consumer contract. It holds one payment per
   Makhzan deal id, lets the payee release it while the guard says healthy, and lets the payer
   refund it when the provider is in default or the deal has reached its end block without a
   release. No admin, no owner, no upgrade path.

Everything is local: Foundry unit, boundary, fuzz and gas/size tests against the real `Makhzan`
(through the existing test harness, which only seeds bond state). No deploy, no live transaction.

## Technical Context

- **Language / compiler**: Solidity `0.8.28`, `evm_version = paris`, `via_ir = true`,
  `optimizer_runs = 1` — inherited from `contracts/foundry.toml`, not overridden.
- **Dependencies**: `IMakhzan` (already in the repo) and `forge-std` for tests. No new package, no
  OpenZeppelin, no external library.
- **Test base**: `contracts/test/makhzan/harness/MakhzanTestBase.sol` (window `50`,
  duration `600…14 400`, price `5e14` planck = `5e18` wei, `WEI_PER_UNIT = 10_000`).
- **Real Makhzan, not a mock**: the suite deploys `MakhzanHarness` (a `Makhzan` subclass used only
  to seed bond values) and drives it with `createDeal`, `challenge`, `settle` to produce all four
  `healthOf` codes. There is no stub of `healthOf` anywhere.
- **Size target**: `StorageGate` runtime under `1,500 B`. Measured with `forge build --sizes`; the
  existing `scripts/check-size.mjs` keeps enforcing the `Makhzan` budget only.

## Design

### MakhzanGuard

```solidity
library MakhzanGuard {
    error Pending();        // healthOf == 2, challenge open inside the window
    error Default();        // healthOf == 3, challenge open past the deadline
    error SettledOrNone();  // healthOf == 0, settled or no such deal
    error Expired();        // healthOf == 1 but block.number >= endBlock

    function isHealthy(IMakhzan makhzan, uint32 dealId) internal view returns (bool);
    function requireHealthy(IMakhzan makhzan, uint32 dealId) internal view;
}
```

- `requireHealthy` reads `healthOf` once, and reads `dealOf` only in the healthy branch. Reading
  `dealOf` for a missing deal is harmless but wasteful, and it would make the error order depend on
  a second call.
- The library is `internal` only: no linked deployment, no external call, no new address to trust.
  The cost is inlined bytecode in every consumer, which is exactly why the gate stays tiny.
- `isHealthy` duplicates the two reads rather than calling `requireHealthy` in a `try`; `view`
  libraries cannot catch their own reverts, and returning a bool is the API other contracts want.

### StorageGate

State machine per deal id: `0 none → 1 locked → 2 released | 3 refunded`. Transitions are one-way.

```solidity
struct Lock {
    address payer;   // slot 0 (20) + amount (12) = 32/32
    uint96 amount;
    address payee;   // slot 1 (20) + status (1) = 21/32
    uint8 status;
}
mapping(uint32 dealId => Lock) public lockOf;
IMakhzan public immutable makhzan;
```

- `lock`: reject zero payee and zero value (`BadLock`), reject an existing lock (`AlreadyLocked`),
  then `MakhzanGuard.requireHealthy`. Store, emit `Locked`.
- `release`: caller must be `payee` (`NotPayee`), status must be `locked` (`NotLocked`), then
  `requireHealthy`. Set `status = released` **before** the transfer, emit `Released`, send with
  `call` and revert `TransferFailed` if it fails.
- `refund`: caller must be `payer` (`NotPayer`), status must be `locked`. Allowed when
  `healthOf == 3` (`Default`) **or** `block.number >= endBlock`. The second branch is exactly the
  complement of the guard's `block.number < endBlock`, so a deal is never in a state where neither
  release nor refund is possible (`endBlock` itself: release refused, refund allowed). Otherwise
  revert `RefundNotAllowed`. Set `status = refunded` before the transfer.
- `refund` needs `healthOf` and `endBlock` directly, not `requireHealthy`, because `healthOf == 3`
  must be *allowed* there. It reads `dealOf` once for `endBlock`.
- No receive/fallback: only `lock` can add value, so the accounting cannot drift.

### Boundary table (block numbers)

| Moment | `release` | `refund` |
| --- | --- | --- |
| healthy, `block < endBlock` | allowed | refused (`RefundNotAllowed`) |
| healthy, `block == endBlock` | refused (`Expired`) | allowed |
| healthy, `block > endBlock` | refused (`Expired`) | allowed |
| `healthOf == 2` | refused (`Pending`) | refused |
| `healthOf == 3` | refused (`Default`) | allowed |
| `healthOf == 0` (settled or missing) | refused (`SettledOrNone`) | refused |

## Files

| File | Purpose |
| --- | --- |
| `contracts/src/makhzan/MakhzanGuard.sol` | library, two functions, four errors |
| `contracts/src/makhzan/StorageGate.sol` | consumer contract, three functions |
| `contracts/test/makhzan/MakhzanGuard.t.sol` | guard truth table against the real Makhzan |
| `contracts/test/makhzan/StorageGateLock.t.sol` | lock rules, one-per-deal, health gate |
| `contracts/test/makhzan/StorageGateRelease.t.sol` | release rules, double release, callers |
| `contracts/test/makhzan/StorageGateRefund.t.sol` | both refund routes, double refund, callers |
| `contracts/test/makhzan/StorageGateFuzz.t.sol` | release invariant + refund invariant |
| `evidence/raw/t1/90-*` | red/green output, size and gas table |

## Test Strategy

1. **Guard truth table** — all four codes plus the expired-healthy case, with block numbers chosen
   at the boundary (`start + WINDOW`, `endBlock - 1`, `endBlock`, `endBlock + 1`). Assert the exact
   custom error with `vm.expectRevert(MakhzanGuard.Pending.selector)` and friends.
2. **Lock** — allowed only when healthy; the four refusal errors; second lock on the same id;
   zero payee; zero value; the recorded payer/payee/amount read back.
3. **Release** — success moves exactly the locked amount and emits; wrong caller; double release;
   one test per health code; at `endBlock` and `endBlock + 1`.
4. **Refund** — `healthOf == 3` before the end block; end block reached without release; after a
   release the payer cannot refund; wrong caller; double refund; a healthy deal inside its term
   cannot be refunded.
5. **Fuzz** — over a deal id, a block offset and a caller role: call `release` and assert that a
   value movement happened **only** when `healthOf == 1 && block.number < endBlock` at call time.
   Same shape for `refund` and its two allowed states.
6. **Size and gas** — `forge build --sizes` for the runtime number; `forge test --gas-report` (or a
   scripted `cast`/`vm` measurement) for a per-function table.

## Guardrails

- `Makhzan.sol` and `IMakhzan.sol` are read-only for this feature. Any need to change them stops the
  work and becomes a decision note.
- No deploy script, no key, no RPC. `StorageGate` is never constructed outside tests.
- One commit per task, each pushed; `[ai]` in every commit subject; the tree stays green at each
  commit so a bisect lands on a passing test.
