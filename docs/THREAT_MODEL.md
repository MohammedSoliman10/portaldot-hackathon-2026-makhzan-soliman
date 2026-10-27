# THREAT MODEL — Makhzan

Scope: the Makhzan contract (`contracts/src/makhzan/`), the CLI/daemon (`apps/makhzan/`), and the
evidence writer. Local anvil is the reference network; live behaviour on Portaldot was run and is
recorded in `evidence/raw/t1/` (`59-live-deploy.txt` .. `77-verify-deal2.txt`), so anything not
covered there is `[pending live run]`.

## Assets

1. The provider bond (native units, held by the contract).
2. The client's prepaid deal price.
3. The integrity of the "which block is challenged" choice.
4. The evidence record: a false claim in it is a reputational loss, not a fund loss.
5. The deployer key (only in the operator's environment; never in a record, argv or evidence file).

## Adversaries

- **Lying provider**: commits a root it cannot answer for, or answers with the wrong bytes/path.
- **Griefer client**: opens challenges to burn provider time, or challenges a settled deal.
- **Opportunistic relayer**: calls `resolve` for someone else; intended and permissionless.
- **Careless operator**: reuses a nonce, loses a send response, deploys twice, prints a key.
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
