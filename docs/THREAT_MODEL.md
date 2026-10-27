# THREAT MODEL — Makhzan

Scope: the Makhzan contract (`contracts/src/makhzan/`), the CLI/daemon (`apps/makhzan/`), and the
evidence writer. Local anvil is the reference network; live behaviour on Portaldot was run and is
recorded in `evidence/raw/t1/` (`59-live-deploy.txt` .. `77-verify-deal2.txt`), so anything not
covered there is `[pending live run]`.

## Assets

1. The provider bond (native units, held by the contract).
2. The client's prepaid deal price.
3. A payment the consumer gate (`StorageGate`) holds between `lock` and `release`/`refund`.
4. The integrity of the "which block is challenged" choice.
5. The evidence record: a false claim in it is a reputational loss, not a fund loss.
6. The deployer key (only in the operator's environment; never in a record, argv or evidence file).

## Adversaries

- **Lying provider**: commits a root it cannot answer for, or answers with the wrong bytes/path.
- **Griefer client**: opens challenges to burn provider time, or challenges a settled deal.
- **Opportunistic relayer**: calls `resolve` for someone else; intended and permissionless.
- **Careless operator**: reuses a nonce, loses a send response, deploys twice, prints a key, or names a
  payee that is not the provider the floor is meant to check.
- **Payer who trusts the floor as proof**: treats `StorageGate`'s `minBond` as evidence that the
  provider still holds the file.
- **Evidence reader**: a web app that must not render missing data as a healthy/zero value.

## Invariants (what the tests pin)

1. `answer` accepts only a block of the configured length at the challenged index whose path hashes to
   the committed root; otherwise `ProofRejected`.
2. The exact deadline block is inside the response window; the next block is not (`WindowOpen`).
3. `resolve` is only callable after the deadline with a challenge open; it slashes exactly `slashBps`
   of the bond and credits `slash * 10000` wei to the owner.
4. A passed challenge leaves the bond unchanged and closes the challenge.
5. `settle` requires the end block and no open challenge; a settled deal cannot be challenged.
6. `healthOf` never reports a settled/unknown deal as healthy; the deadline block is `2`, the next
   block is `3`.
7. Unit math is integer-only: no floats, no rounding, exact multiple-of-unit value checks.
8. A deploy has a pending record before the send; a lost response cannot silently deploy twice.
9. The gate locks one payment per deal; `release` pays only the recorded payee, only while
   `MakhzanGuard` says healthy; `refund` pays only the payer, only when `healthOf == 3` or at/after the
   deal's end block, and the gate's balance is `0` once every lock is closed.
10. With a non-zero `minBond`, `release` refuses with `BondTooLow` when the payee's own provider record
    (matched by provider id) is below the floor. With `minBond == 0` the check is skipped by design.

## Honest limits

- **One block at one moment**: a passed challenge does not prove continuous possession.
- **Index choice**: the challenge index comes from the D5 fallback (block hash + deal id + attempt),
  not a VRF; a miner can bias it at a cost, and the spec does not claim otherwise.
- **Identical blocks**: leaves commit bytes, not positions, so identical blocks are interchangeable.
- **Bond coverage**: one shared provider bond covers all of that provider's deals.
- **No source verification on the local chain**: the fixture records `sourceVerified: false`; the
  runtime code hash is not an explorer attestation.
- **Evidence is REPORTED**: values come from the run's own records; only a reader that queries the
  chain may add MEASURED. `null` health means "not recorded", never healthy.
- **Pruned receipts**: a missing raw receipt is `unavailable-pruned`, not evidence of a failed run.
- **Live numbers**: fees and gas were measured on the live deployment
  (`evidence/raw/t1/60-live-pass.txt`, `69-live-resolve-b.txt`, `72-live-summary.txt`) and block
  time is 6 s over 100 blocks (`evidence/raw/g02/11-block-time.txt`), but finality is not measured:
  local finality is a one-confirmation heuristic, never the `finalized` tag, and any other live
  unknown stays `[pending live run]`.
- **Operator key**: any process that reads `MAKHZAN_PRIVATE_KEY` can spend the owner's funds; the
  evidence writer never reads or copies it.
- **The gate's bond floor is a same-transaction read**: `release` reads `healthOf` and
  `providerOf(payee)` as it executes. A slash that lands afterwards (even later in the same block) does
  not undo a release that already succeeded; the gate is not atomic with Makhzan.
- **`minBond = 0` sees nothing after a slash**: zero disables the check, and `healthOf` returns to `1`
  once a default is resolved, so the slash that just happened is invisible to it
  (`evidence/raw/t1/101-gate-demo-local.txt`, step 7). Only a non-zero floor reacts to the lower bond.
- **The payee must be the provider**: the floor reads `providerOf(payee)` and counts only when that
  record's provider id matches the deal's `providerId`. Any other payee reads bond `0` — refused with
  `BondTooLow` when the floor is non-zero, paid when it is zero. The gate cannot verify a provider it
  was not told about.
- **The gate is local only**: implemented and tested, never deployed to Portaldot. It has no admin and
  no upgrade path, so a bug cannot be fixed at the same address.
- **The gate's deploy is not byte-for-byte verified**: `StorageGate` stores the Makhzan address as an
  immutable, so the artifact has zeros where the chain has the address (`verify:deployment` reports
  `differs at byte 191: chain 5f artifact 00`). A gate deploy is checked by code length, code hash and
  a `makhzan()` read-back instead (`evidence/raw/t1/100-gate-deploy.txt`).

## Residual risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Lost send response deploys twice | `state: sending` pending record, refusal, `--resume` / `--force-new` |
| Receipt timeout loses the deployment | bounded retries, pending record kept, resume by hash |
| Thin balance after deploy | 100 tPOT default reserve with balance/estimate/remainder printed |
| Bad estimate on a new chain | dry-run says "calibration: not yet verified" until a measured ratio exists |
| Secret in evidence | scanner with a narrow allowlist and a canary test on every gate |
| Evidence shape drift | one versioned schema, strict validator, immutable files, manifest SHA-256 |
| Wrong artifact deployed | `verify:deployment` compares runtime code byte for byte |
| Operator confusion at deploy time | `doctor` prints an exact fix per failed check |
| A release races a slash | documented same-transaction limit; a later slash does not reverse a release |
| Payee is not the provider | a non-zero `minBond` refuses every release (`BondTooLow`); a floor of `0` pays that address, so the payer must name the provider |
| Gate immutables defeat byte comparison | check code length, code hash and `makhzan()` on deploy; recorded as a limitation rather than "verified" |
