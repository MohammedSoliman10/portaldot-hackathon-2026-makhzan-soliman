# Specification Quality Checklist: Makhzan Proof and Status web app

**Purpose**: Validate specification completeness and quality before planning
**Created**: 2026-10-23
**Feature**: [spec.md](../spec.md)

## Content quality

- [x] The feature has a single, bounded purpose: a read-only status and proof app.
- [x] The six user stories are prioritised and each is independently testable.
- [x] Non-goals are explicit and binding (no wallet, no backend, no indexer, no unlabelled data).
- [x] Every mandatory section is present: scenarios, edge cases, requirements, entities, success
  criteria, assumptions, out-of-scope.
- [x] The stack is named because the owner mandated it; it is not an incidental implementation leak.

## Requirement completeness

- [x] No `[NEEDS CLARIFICATION]` marker remains; all fourteen defaults are recorded in Clarifications.
- [x] Every functional requirement is testable and has an observable outcome.
- [x] Every success criterion is measurable without private context.
- [x] The four label values and the two five-state vocabularies are defined, not implied.
- [x] Mode resolution has one table and one source of truth.
- [x] Read-only is defined by an explicit allowlist and a forbidden-symbol list.
- [x] Failure states are specified: missing evidence, hash mismatch, bad config, chain mismatch, RPC
  timeout, pruned receipt, missing `healthOf`, oversize file.
- [x] Every absence has a required wording ("not recorded", "unavailable (…)", "not available on this
  deployment"), so a missing value cannot read as zero.
- [x] Accessibility, responsive widths, reduced motion and contrast are acceptance criteria, not
  aspirations.
- [x] The evidence fixture, its provenance and the deterministic sample are named.

## Feature readiness

- [x] The three P1 screens have component tests named in the plan and the task list.
- [x] The no-network (RECORDED) render test is a task, not a slogan.
- [x] The browser parity test has a runner, a command and a CI job.
- [x] The Judges page is tied to `docs/EXPLAIN.md` by a sync test.
- [x] Every task is one commit; test tasks precede implementation tasks.
- [x] No task requires a live RPC, a wallet, a key or a deployment.

## Scope traps reviewed

- [x] "Code verified" is narrowed to a runtime hash match; explorer source verification is not claimed.
- [x] The accrual counter cannot invent a measured block time; ticks are `SIMULATED`.
- [x] The replay cannot be mistaken for a live run; it is labelled and block-indexed.
- [x] The deals table cannot imply completeness; it states "showing X of Y".
- [x] The evidence file cannot be silently swapped; the manifest hash is checked and a mismatch is
  visible.
- [x] The verifier cannot upload: it has no fetch/upload path and a test asserts it.
- [x] The shared Merkle module is imported, not copied, and the import constraint is recorded as a
  complexity-tracking item.

## Notes

- The specification names React, Vite, TypeScript, Tailwind and viem because the owner fixed the stack;
  everything below that line (component structure, state, tests) is in `plan.md`, not here.
- `WEI_PER_UNIT = 10_000` remains an assumption from feature 002. The app shows native units and only
  converts to wei for the recorded owner credit, with the conversion labelled.
- The fixture is local anvil evidence only. No row in this feature may be labelled live until the 002
  live gate has a verdict and a live run exists.
