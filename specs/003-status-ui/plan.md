# Implementation Plan: Makhzan Proof and Status web app

**Branch**: `003-status-ui` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-status-ui/spec.md`

## Summary

Build a static, read-only React application that renders the Makhzan deployment from versioned
evidence and, only when an address is configured, overlays live view calls. The evidence is the base
layer, so every route renders with no RPC. The app reuses `apps/makhzan/src/merkle.ts` unchanged for
browser file verification and runs the shared golden vectors through that same module in a real
browser. v1 has no wallet, no key, no backend and no write path; a source guard proves it.

## Technical Context

**Language/Version**: TypeScript 5.9.3, React 19.2, Node 24.20 (matching the repo's Node pin). Library versions below are planning pins; T001 records the exact resolved versions in `package-lock.json`.

**Primary Dependencies**: `react`, `react-dom`, `react-router-dom` 7, `viem` 2.57.7 (the same version
as `apps/makhzan`), `tailwindcss` 4.1 + `@tailwindcss/vite`, `@fontsource-variable/space-grotesk`
and `@fontsource/ibm-plex-mono` (OFL-1.1). Dev: `vite` 7, `vitest` 4, `@vitest/browser`,
`playwright`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `typescript-eslint`
and the Vite React plugin. No wallet, charting, state-management, UI-kit or analytics dependency.

**Storage**: Static JSON under `apps/status-ui/public/evidence/`. No database, cookies or localStorage
for user data. No file persistence from the verifier.

**Testing**: Vitest for unit and component tests (jsdom); Vitest browser mode (Playwright Chromium)
for the Merkle parity spec; a production-build smoke test that serves `dist/` and opens each route.

**Target Platform**: Evergreen browsers, ES2022; static hosting on Vercel; local `vite preview`.

**Project Type**: Single frontend app (`apps/status-ui`) in the existing repository, importing one
module from `apps/makhzan`.

**Performance Goals**: LCP < 2.5 s on a cold cache over a normal connection; initial route JavaScript
< 300 KB gzip; no long task over 50 ms while verifying a 16 MiB file.

**Constraints**: Read-only; no RPC in `RECORDED`; 4 s timeout and 2 retries per read; stale after
30 s; chain id guard; WCAG 2.2 AA; 360/768/1280 px; no third-party runtime requests.

**Scale/Scope**: Six routes, one evidence bundle version at a time, at most 50 deals in the list,
at most 16 MiB in the verifier, one deployment per build.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature satisfies it |
| --- | --- |
| I. Tests Before Funds | No contract and no funds. Test-first still applies to every module; each test failing for a behavioural reason before its implementation. |
| II. Small, Daily Commits | One task, one commit, `type(scope): summary [ai]`; no batching at the freeze. |
| III. No Secrets, Ever | Only four public `VITE_` values; no key, no wallet, no signing dependency; the fixture contains public local addresses and hashes only. |
| IV. Bounded Agent Authority | No agent, no payout, no transaction path. The app cannot authorize anything. |
| V. Evidence Over Claims | Every value carries a label and a source; the fixture transcribes a real local run; the code status stops at a runtime-hash match. |
| VI. Honesty About Limits | The Judges page and `docs/status-ui.md` list continuous storage, distinct copies, randomness, source verification and live-number limits. |
| VII. Modular Design | The app depends on the stable `IMakhzan` view surface only; no storage layout is hard-coded except packed slot 0, which is shared with `contracts/storage-layout.md` and golden-tested. |
| VIII. Untrusted Input | Evidence is strictly validated (exact keys, types, lengths, cross-field rules); files are untrusted and size-bounded. |
| IX. Local First, Live Second | Default `RECORDED`; `LIVE` requires an explicit address and never runs in this stage. No live RPC is called by the implementation stage. |
| X. One Feature Per Tier | Only `apps/status-ui`, `specs/003-status-ui`, the evidence fixture, CI branch trigger, README/docs updates for this feature. No 002 source change except none at all. |
| XI. Disclosure | README table row plus a dependency/licence table and AI-assistance marking; `LICENSE` already exists. |
| XII. Explainability | `docs/EXPLAIN.md` gains a "what the status page does and does not prove" section; the Judges page mirrors it. |
| XIII. Reproducibility | `npm ci && npm test && npm run build` from the app; sample file generation documented; Vercel settings documented. |
| XIV. Privacy by Default | No upload, no telemetry, no third-party request; the file never leaves the tab. |
| XV–XVI. Proofs Carry Bytes; Merkle Hardening | The verifier uses the unchanged shared module and the shared vectors, so prefixes, promotion and direction rules cannot drift. |
| XVII. Reality Over Spec | A live chain contradiction pauses the live overlay and is recorded in `docs/decisions.md`; this stage records no live claim. |

**Result**: PASS. No principle is weakened. The only justified deviation is the cross-app import
(Complexity Tracking), chosen over copying the Merkle code.

## Project Structure

### Documentation (this feature)

```text
specs/003-status-ui/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── contracts/
│   ├── evidence-schema.md        # draft v0, published as docs/evidence-schema.md
│   ├── fixture-local-anvil.json  # transcription of evidence/raw/t1/87-e2e-process.txt
│   └── ui-contract.md            # routes, components, labels, read surface, guards
└── tasks.md
```

### Source Code (repository root)

```text
vercel.json                        # repository root: root dir ".", install/build/output, SPA rewrites
apps/status-ui/
├── index.html
├── package.json
├── vite.config.ts                 # alias to ../makhzan/src/merkle.ts, dedupe viem, fs.allow repo root
├── tsconfig.json
├── README.md
├── .env.example                   # four variable names, empty values
├── scripts/                       # make-sample, check-sample, check-evidence, check-bundle, smoke-routes
├── public/
│   ├── evidence/
│   │   ├── index.json
│   │   └── local-anvil-2026-10-23.json
│   └── samples/
│       └── demo-8k.bin            # 8,192 x 0x5a, generated by a documented script
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── ErrorBoundary.tsx
│   ├── config/
│   │   ├── env.ts                 # four variables, strict parsing
│   │   └── modes.ts               # resolution matrix
│   ├── data/
│   │   ├── evidence.ts            # fetch + SHA-256 + strict validation
│   │   ├── schema.ts              # v0 types and validators
│   │   ├── labels.ts              # Metric type, four labels, formatting
│   │   ├── client.ts              # public client, timeout/retry, chain-id guard
│   │   ├── reads.ts               # the seven view calls
│   │   ├── peek.ts                # slot-0 decoder with the golden value
│   │   ├── accrual.ts             # anchor + simulated ticks + cap
│   │   ├── receipts.ts            # receipt classification, pruned/error/not-recorded
│   │   └── status.ts              # round labels and evidence stages
│   ├── merkle/
│   │   ├── shared.ts              # re-export of apps/makhzan/src/merkle.ts
│   │   └── verifyFile.ts          # split 1 KiB, progress, compare
│   ├── components/
│   │   ├── ModeBanner.tsx
│   │   ├── EvidenceNotice.tsx
│   │   ├── Metric.tsx
│   │   ├── LabelLegend.tsx
│   │   ├── StageTracer.tsx
│   │   ├── AccrualCounter.tsx
│   │   ├── CopyHash.tsx
│   │   ├── HealthChip.tsx
│   │   ├── SignalBadge.tsx        # STALE / unavailable states
│   │   └── layout/{Shell,SideIndex,Footer}.tsx
│   ├── pages/
│   │   ├── Overview.tsx
│   │   ├── Deal.tsx
│   │   ├── Verify.tsx
│   │   ├── Proof.tsx
│   │   ├── Judges.tsx
│   │   └── Replay.tsx
│   ├── styles/
│   │   ├── tokens.css             # ink/paper/ochre, type scale, hairlines
│   │   └── app.css                # @import "tailwindcss" + utilities
│   └── test/
│       ├── fixtures.ts
│       └── render.tsx
└── test/                          # colocated specs live next to sources; this holds shared specs
    ├── merkle-parity.test.ts
    ├── merkle-parity.browser.test.ts
    ├── readonly-guard.test.ts
    ├── no-network.test.tsx
    ├── evidence.test.ts
    ├── labels.test.ts
    ├── peek.test.ts
    ├── accrual.test.ts
    ├── receipts.test.ts
    ├── config.test.ts
    ├── overview.test.tsx
    ├── deal.test.tsx
    ├── verify.test.tsx
    ├── proof.test.tsx
    ├── judges.test.tsx
    └── replay.test.tsx
```

**Structure Decision**: One app under `apps/status-ui`, no shared package extraction. The only
cross-app dependency is the Merkle module, imported by alias so the exact browser code is the code the
CLI uses. The Vercel Root Directory is the repository root so that path resolves in CI and on Vercel.

## Data Flow

```text
build-time VITE_ vars ──> resolveMode() ──> ModeBanner + whether a client exists
                                             │
public/evidence/index.json ──> SHA-256 check ──> parseEvidence() ──> EvidenceBundle (base layer)
                                                                       │
                            ┌──────────────────────────────────────────┤
                            │                                          │
                    RECORDED route render                    LIVE overlay (view calls only)
                    (all values REPORTED)                    every value MEASURED + block + UTC
                            │                                          │
                            └──────────────> DealView / OverviewView <┘
                                                     │
                                      Metric(label, source, value)
```

The live overlay never replaces the evidence object; it annotates per-field values. A failed read
leaves the evidence value in place with a `STALE` badge after 30 s.

## Phase Gates

1. **Evidence and schema**: schema validators, fixture, manifest hash, label vocabulary — tests first.
2. **Base layer**: config/mode, evidence loader, shell, banner, error boundary, Metric — tests first.
3. **US1 Overview**: peek decode, provider read, deals table, stage tracer.
4. **US2 Deal**: accrual anchor/ticks, timeline, five labels, health fallback, copy.
5. **US3 Verify**: shared Merkle import, splitter, progress, parity Node + browser, sample file.
6. **US4 Proof**: receipts, refusals, pruned/error/not-recorded.
7. **US5 Judges**: five steps, gas, rerun commands, not-claimed.
8. **US6 Replay**: block axis, pass/slash frames, reduced motion.
9. **Quality gate**: a11y, responsive, no-network, read-only guard, build, bundle budget, docs.
10. **Checkpoint**: evidence, README/docs updates, sanitized bundle.

Each phase ends with `npm run typecheck && npm test && npm run build` (plus `npm run test:browser` for
phase 5 and the final gate) and a checkpoint note. No phase deploys anything or calls an RPC.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Import a module from `apps/makhzan` into the app | The spec requires the *same* Merkle code, not a copy; a copy is exactly the drift the golden vectors exist to catch | Copying `merkle.ts` into the app creates two implementations and a silent divergence path; extracting a package now would change feature 002's tested imports and exceed this feature's scope |
| A real browser test dependency (Playwright) | "Parity in the browser build" cannot be proven by jsdom or Node alone | A Node-only parity test would leave bundling, polyfill and ESM/CJS risk untested; the browser spec is one test, run in its own job |
| A hash-verified evidence manifest | Static JSON can be swapped without detection; judges need provenance | Trusting the file silently would make "evidence" a claim rather than an artifact |
| Cross-repo-root Vercel build | The shared import lives outside the app directory; `vercel.json` must therefore sit at the repository root | Setting the Root Directory to the app would break the import or require a copy of the module |

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Shared-module resolution on Vercel | Build fails or bundles a second viem | Vercel Root Directory = repo root; install both packages; `resolve.dedupe: ['viem']`; a CI production build catches it |
| RPC 95.5 % availability | Partial pages, stale data | Evidence-first, 4 s timeout, 2 retries, circuit breaker, 30 s stale badge, full recorded fallback |
| Evidence values read as live | Dishonest demo | The label is part of the `Metric` type; a test enumerates numeric nodes; the banner states the mode |
| Block time not recorded | A fake "live" tick | `timing.basis = node-default`; ticks are `SIMULATED`; replay is block-indexed |
| `healthOf` absent on older deployments | A revert breaks the page | Optional call, revert → "not available on this deployment" |
| Pruned receipts misread as failures | False negative about the project | Three-way classification and neutral styling; never "failed" |
| Browser test flakiness | CI red on unrelated changes | One spec, deterministic vectors, retry once, separate job |
| Cross-app import is brittle | Future 002 refactor breaks the UI build | The alias is one file; the parity test fails immediately if the module signature changes |
| Fixture trusted as complete | Overclaiming | Manifest hash, provenance line, "showing X of Y", explicit not-recorded states |
| Local evidence used in a live build | A local deal shown as if it were on the testnet | FR-062: chain/address mismatch warning; local deals never become live fallbacks |
| `health` absent from the fixture | A missing field read as healthy | `null` renders "not recorded by the run"; only a successful `healthOf` call renders a health value |
