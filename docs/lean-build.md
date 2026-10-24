# Lean-build measurements (done, nothing cut)

**Feature**: `002-core-storage-proofs` | **UTC**: 2026-10-21 | **Kind**: measurement only

`Makhzan` runtime is **9,210 B** after STEP 0. At the owner's planning estimate of
`0.079 tPOT per runtime byte + 13 tPOT per contract`, the deploy is about **741 tPOT**, while the
owner has **500 tPOT** in total. This file measures what each candidate cut would save. **No cut is
applied**; the contract in the repository is unchanged by this document.

## Method

- Each variant was built from a pristine copy of `contracts/src/makhzan/` in its **own scratch
  directory outside the repository** (`/tmp/opencode/lean-*`), with the same `solc 0.8.28`,
  `evm_version = paris`, `optimizer = true`, `optimizer_runs = 1`, `bytecode_hash = none` and
  `cbor_metadata = false` as `contracts/foundry.toml`.
- Size is the `forge build --sizes` runtime column for `Makhzan` (EIP-170 budget 24,576 B; the
  project budget is 10,240 B).
- One variant per fresh directory and `out/` removed, so no result reuses a previous artifact.
- Deploy estimate uses the owner's planning formula: `0.079 × runtimeBytes + 13` tPOT. It is an
  estimate, not a measurement of Portaldot's fee schedule (G05 is still open).

## Results

| Variant | Runtime | Δ vs baseline | Deploy estimate |
| --- | ---: | ---: | ---: |
| baseline (as committed, `runs = 1`) | 9,210 B | — | 741 tPOT |
| no `peek` (operator slot reader removed) | 8,837 B | −373 | 711 tPOT |
| no events (declarations + every `emit`) | 8,537 B | −673 | 687 tPOT |
| no "guarded checks" (deadline-overflow guard, `activeDeals` underflow guard) | 9,154 B | −56 | 736 tPOT |
| `optimizer_runs = 200` | 9,274 B | +64 | 746 tPOT |
| `optimizer_runs = 10_000` | 11,886 B | +2,676 | 952 tPOT |
| `via_ir = true` | 6,378 B | −2,832 | 517 tPOT |
| `via_ir` + no `peek` | 6,098 B | −3,112 | **495 tPOT** |
| `via_ir` + no events | 5,879 B | −3,331 | 477 tPOT |
| `via_ir` + no `peek` + no events | 5,595 B | −3,615 | **455 tPOT** |
| `via_ir` + no `peek` + no events + no guards | 5,576 B | −3,634 | 454 tPOT |

## What the numbers say

1. **The compiler pipeline is the lever, not the code.** `via_ir = true` alone saves 2,832 B
   (31% of runtime) with no behaviour change. `optimizer_runs` is already at its size-optimal
   value: raising it to 200 costs 64 B and 10,000 costs 2,676 B.
2. **Events are the largest removable surface** (`emit` + declarations, 673 B), but they are the
   only push-based observability. The daemon polls state and the evidence writer can use typed
   getters, so removing them is compatible with `cli-daemon.md`, but it removes logs for
   explorers and the demo.
3. **`peek` costs 373 B** and is only an operator convenience; the typed getters (`dealOf`,
   `challengeStateOf`, `accruedOf`, `providerOf`) cover the CLI.
4. **Dropping guards buys 19–56 B and costs safety.** Not worth it; the deadline-overflow and
   underflow guards stay.
5. Individual savings do not add linearly (via_ir + peek + events = 3,615, while the three
   deltas sum to 3,878), so combinations must be measured as combinations.

## Decision (owner, 2026-10-21)

**`via_ir = true` and nothing else is enabled** (DR-012). `peek` and the events stay; solc 0.8.28,
`evm_version = paris` and `optimizer_runs = 1` are unchanged. Measured in the repository after the
change: runtime **9,210 → 6,378 B**, creation **9,773 → 6,966 B**, planning estimate ≈ **517 tPOT**
against ~1,500 tPOT available. All test, fuzz, invariant, vector and TypeScript suites were re-run
green; a cold build takes 36 s. G02 must still confirm the live chain accepts the IR bytecode.

The table above remains the record of what the other cuts would have bought; they are **not**
applied, so the "recommended lean target" below is optional follow-up, not the current plan.

## Recommended lean target (not taken)

The measurement suggested a ≤ 5,600 B target via `via_ir` + drop `peek` + drop events (5,595 B,
≈ 455 tPOT). **The owner chose a smaller step (DR-012): `via_ir` only.** That lands at 6,378 B and
≈ 517 tPOT, comfortably inside the ~1,500 tPOT now available, with `peek` and events intact.
Dropping `peek` (373 B) and events (673 B) remains available as optional follow-up if a later
feature needs the headroom; both are behaviour or observability changes and were not taken.

Note: `via_ir` changed codegen, so the full `forge test`, fuzz, invariant and TypeScript suites were
re-run green and the vectors still match. G02 must confirm the live chain accepts the IR bytecode;
the compiler pin is provisional until that verdict.
