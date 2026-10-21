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

## Recommended lean target

**Target: `Makhzan` ≤ 5,600 runtime bytes (≈ 455 tPOT at the planning formula).**

Route: `via_ir = true`, drop `peek`, drop events. That is 5,595 B measured, leaving ~45 tPOT of the
500 tPOT budget for the deployment transaction's calldata/overhead and the demo transactions
(five or six signed calls). If events must stay for observability, the next-best combination is
`via_ir` + drop `peek` at 6,098 B (495 tPOT): it fits, but with ~5 tPOT of margin, which is too
thin to call safe before G05 measures the real fee schedule.

**Decision needed from the owner** (nothing is cut yet):

- approve `via_ir` + drop `peek` + drop events → 5,595 B, or
- approve `via_ir` + drop `peek` → 6,098 B and accept a ~5 tPOT margin, or
- keep the full surface at 9,210 B and fund ~741 tPOT instead of 500.

Note: `via_ir` changes codegen, so it must be followed by the full `forge test`, fuzz, invariant and
gas-snapshot re-run, and G02 must confirm the live chain accepts the resulting bytecode. The
optimizer/compiler pin itself is provisional until G02, and this document does not change it.
