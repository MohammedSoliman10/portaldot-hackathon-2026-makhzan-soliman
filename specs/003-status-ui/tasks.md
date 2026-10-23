# Tasks: Makhzan Proof and Status web app

**Input**: Design documents from `/specs/003-status-ui/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)
**Feature**: `003-status-ui` | **Branch**: `003-status-ui` | **Stage**: pre-implementation

**Conventions**

- One task, one commit, `type(scope): summary [ai]`, pushed. No task is batched with another.
- Test tasks come first. A test task creates its target module in the same commit as a signature-only
  stub that throws `not implemented`, so the committed red is behavioural (not a missing file).
- `[P]` is used only when the task touches different files and has no dependency on an unfinished task.
- Every path is relative to `/home/mohammed_soliman/hackathons/portaldot-ui`.
- **No task calls a live RPC, deploys, or touches a key.** `LIVE` code paths are tested against mocked
  transports only. The fixture is the only chain data used.
- The stop rule from feature 002 applies: a red test that fails for the wrong reason is fixed before
  the implementation task starts.

---

## Phase 1: Setup (shared infrastructure)

- [ ] **T001** Create the app skeleton in `apps/status-ui/`: `package.json` (`name: status-ui`, type
  module, Node `>=24`, scripts `dev`, `build`, `preview`, `typecheck`, `test`, `test:browser`,
  `smoke`), `tsconfig.json`, `vite.config.ts` (React plugin, Tailwind plugin, alias
  `@makhzan/merkle` → `../makhzan/src/merkle.ts`, `resolve.dedupe: ["viem"]`, `server.fs.allow` =
  repository root, Vitest config), `index.html`, `src/main.tsx`, `src/app/App.tsx` (a placeholder
  that renders the wordmark), `src/vite-env.d.ts`, `apps/status-ui/.gitignore`
  (`node_modules`, `dist`, `.env.local`, `coverage`). Pin `viem` to `2.57.7` to match `apps/makhzan`.
  Run `npm install` to produce `package-lock.json`; do not commit `node_modules`.
- [ ] **T002** Add Tailwind 4 and the design tokens: `src/styles/tokens.css` (ink `#0B0C0B`, paper
  `#EDE7DA`, ash `#8C877C`, ochre `#D9A441`, semantic red `#E5484D`, type scale, hairline, focus
  ring, tabular numerals), `src/styles/app.css` (`@import "tailwindcss";` plus the small set of
  utilities the ledger layout needs), and the two bundled fonts (`@fontsource-variable/space-grotesk`,
  `@fontsource/ibm-plex-mono`). No other font source, no icon package.
- [ ] **T003** Add the test harness: `vitest.config.ts` or the test block in `vite.config.ts`
  (`environment: "jsdom"`, setup file `src/test/setup.ts`), `@testing-library/react`,
  `@testing-library/user-event`, `jsdom`, and `src/test/render.tsx` (render helper with the evidence
  bundle injected). `npm test` runs `vitest run`.
- [ ] **T004** Add the browser test harness: `@vitest/browser`, `playwright`, a `browser` project in
  the Vitest config (Chromium headless, one worker), `npm run test:browser`, and a trivial
  `test/browser-smoke.browser.test.ts` that renders a `<main>`; prove the command runs locally before
  writing the parity spec.
- [ ] **T005** Add the evidence base files: copy the validated fixture to
  `apps/status-ui/public/evidence/local-anvil-2026-10-23.json`, write
  `apps/status-ui/public/evidence/index.json` (schema `makhzan.evidence-index/v0`, `current`,
  `sha256` = the file's SHA-256, environment, `generatedAt`), and add
  `apps/status-ui/scripts/check-evidence.mjs` that recomputes the hash and validates the JSON against
  the schema rules. `npm run check:evidence` must exit 0.
- [ ] **T006** Add the deterministic sample: `apps/status-ui/scripts/make-sample.mjs` writes
  `apps/status-ui/public/samples/demo-8k.bin` as 8,192 bytes of `0x5a`;
  `apps/status-ui/scripts/check-sample.mjs` recomputes its root with `apps/makhzan/src/merkle.ts` and asserts
  `0xd6bcfc4d0c933f0680ec2e7b1c0ea8aecba797de45bf726ae0cac4c8c286325b7`. Wire `npm run check:sample`.
- [ ] **T007** Add the Vercel and SPA files: `vercel.json` **at the repository root** (Root Directory `.`, install
  and build commands, output `apps/status-ui/dist`, rewrite `/(.*)` → `/index.html`),
  `apps/status-ui/.env.example` with the four names and empty values only, and
  `apps/status-ui/scripts/smoke-routes.mjs` that serves `dist/` and requests `/`, `/deal/2`, `/verify`, `/proof`,
  `/judges`, `/replay`, asserting 200 and the app shell.
- [ ] **T008** Add the CI job in `.github/workflows/ci.yml`: a `status-ui` job on push to `003-status-ui` and
  `main` (Node 24.20, `npm ci` in `apps/makhzan` and `apps/status-ui`, typecheck, node
  tests, browser parity with `npx playwright install --with-deps chromium`, evidence check, sample
  check, build, route smoke). Do not change the contracts job.
- [ ] **T009** Publish the schema and the app README: copy
  `specs/003-status-ui/contracts/evidence-schema.md` to `docs/evidence-schema.md` (with the fixture
  SHA-256 appended), and add `apps/status-ui/README.md` with the commands, the four variables, the
  mode matrix, the Vercel settings and the AI-assistance disclosure. No fake screenshot.

**Checkpoint**: `npm run typecheck && npm test && npm run build` run in the app; the evidence and
sample checks pass; the browser smoke test runs. No page beyond the placeholder exists.

---

## Phase 2: Foundational (blocking)

- [ ] **T010** [P] Write the failing config tests in `test/config.test.ts` for `src/config/env.ts` and
  `src/config/modes.ts`: the full mode matrix (D-06), invalid mode value, missing/invalid address,
  default chain id, and no client in `RECORDED`. Create both modules as signature-only stubs that
  throw. Commit the red.
- [ ] **T011** Implement `src/config/env.ts` (read only the four `VITE_MAKHZAN_*` values, strict
  parsing, typed errors) and `src/config/modes.ts` (pure `resolveMode`); make T010 green.
- [ ] **T012** [P] Write the failing evidence-validation tests in `test/evidence.test.ts`: valid
  fixture, unknown top-level key, missing key, wrong type, bad address/hash length, duplicate id,
  unsupported schema, `slot0`/config disagreement, passed round with a bond change, failed round with
  wrong slash arithmetic, non-integer amount. Create `src/data/schema.ts` as a stub that throws.
- [ ] **T013** Implement `src/data/schema.ts` (types + strict validators + cross-field rules from
  `contracts/evidence-schema.md`); make T012 green.
- [ ] **T014** [P] Write the failing manifest/loader tests in `test/evidence-loader.test.ts`:
  manifest fetch, current entry selection, SHA-256 match, hash mismatch warning (still returns the
  bundle marked unverified), missing file, network error, unsupported manifest schema. Create
  `src/data/evidence.ts` as a stub.
- [ ] **T015** Implement `src/data/evidence.ts`: fetch `/evidence/index.json`, verify SHA-256 with
  `crypto.subtle` (pure-TS fallback tested against a known vector), parse strictly, return
  `{ bundle, verified, error }`; never throw into render.
- [ ] **T016** [P] Write failing label tests in `test/labels.test.ts` for `src/data/labels.ts`:
  unit formatting (units/tPOT/wei/blocks/bytes/s), label+source required, `PENDING LIVE RUN` has no
  value, stale flag only on measured values, and a numeric-string guard. Create the module stub.
- [ ] **T017** Implement `src/data/labels.ts` and `src/components/Metric.tsx`: the type-level label
  contract, formatting, source line, stale badge slot and unavailable-reason path; make T016 green.
- [ ] **T018** [P] Write the failing slot-0 test in `test/peek.test.ts` using the golden value
  `0x0000000003e80000000a000100000003002386f26fc1000007d004000000000a` and the eight expected
  fields, plus a wrong-length input and a 31-byte value; create `src/data/peek.ts` as a stub.
- [ ] **T019** Implement `src/data/peek.ts` (single decoder, 30 bytes used) and make T018 green.
- [ ] **T020** [P] Write the failing read-layer tests in `test/reads.test.ts`: timeout, two retries
  with backoff, circuit breaker after three failures, abort on unmount, chain-id mismatch blocking,
  no client in `RECORDED`, and the seven view calls with a mocked transport. Create
  `src/data/client.ts` and `src/data/reads.ts` as stubs.
- [ ] **T021** Implement `src/data/client.ts` (public client only, `timeout: 4000`, `retryCount: 2`,
  `retryDelay: 300`) and `src/data/reads.ts` (the seven calls, typed `ReadResult`); make T020 green.
- [ ] **T022** [P] Write the failing vocabulary tests in `test/status.test.ts` for
  `src/data/status.ts`: all five round labels, all five stages, evidence-stage → UI mapping, and that
  a round cannot be `passed` without the read-back rule. Create the stub.
- [ ] **T023** Implement `src/data/status.ts`; make T022 green.
- [ ] **T024** [P] Write the failing shell tests in `test/shell.test.tsx`: banner copy per mode,
  blocking config notice, blocking chain mismatch, evidence notice, legend present, skip link,
  footer source line. Create `src/components/ModeBanner.tsx`, `EvidenceNotice.tsx`,
  `LabelLegend.tsx`, `src/app/ErrorBoundary.tsx` and `src/components/layout/*` as stubs.
- [ ] **T025** Implement the shell, banner, evidence notice, error boundary, legend, footer, left
  index, the not-found page (FR-063) and the `MAKHZAN / مخزن` wordmark; make T024 green. Each route
  renders inside the shell.
- [ ] **T026** Add `test/readonly-guard.test.ts`, which scans `src/`, `package.json` and the lockfile
  for the forbidden symbols in `contracts/ui-contract.md`, and a self-test proving the scanner catches
  a planted string in a fixture file. The scanner must be green on the real tree.

**Checkpoint**: foundation green; `RECORDED` mode creates no client; the banner and shell render on a
placeholder route.

---

## Phase 3: US1 — Overview (P1)

- [ ] **T027** Write the failing recorded Overview test in `test/overview.test.tsx`: banner
  `RECORDED`, address and copy, chain id, deployment tx/block, code status wording, decoded config
  values, provider row, two deals, "showing 2 of 2", all metrics labelled `REPORTED` with the evidence
  source, and zero calls to `createPublicClient`. Create `src/pages/Overview.tsx` as a stub.
- [ ] **T028** Implement the recorded Overview with the evidence bundle; make T027 green.
- [ ] **T029** [P] Write the failing live-overlay test in `test/overview-live.test.tsx`: mocked
  `peek`, `providerOf`, `eth_getCode` produce `MEASURED` values with block/time; a chain mismatch
  shows the blocking warning and no measured values; a missing RPC URL and an address with no code
  are configuration notices (FR-060/FR-061); a local evidence bundle against a different chain shows
  the evidence-mismatch warning and is not used as a live fallback (FR-062); a read failure keeps the
  reported value with a stale badge. Implementation is T030.
- [ ] **T030** Implement the live overlay for Overview (config, provider, deals, code hash); make
  T029 green.
- [ ] **T031** [P] Write the failing StageTracer test in `test/stage-tracer.test.tsx`: five stages,
  observed/not-observed text equivalents, deployment row wiring, no inference for absent stages.
  Create `src/components/StageTracer.tsx` as a stub.
- [ ] **T032** Implement `StageTracer` and wire it into the Overview hero; make T031 green.
- [ ] **T033** [P] Write the failing deals-table test in `test/deals-table.test.tsx`: cap at 50,
  newest first, "showing X of Y", empty state, row links, health chip. Create
  `src/components/DealsTable.tsx` as a stub.
- [ ] **T034** Implement `DealsTable`; make T033 green.
- [ ] **T035** [P] Write the failing copy-control test in `test/copy-hash.test.tsx`: clipboard
  success, clipboard rejection fallback (selectable text), `aria-live` announcement, truncated
  display with full value available. Create `src/components/CopyHash.tsx` as a stub.
- [ ] **T036** Implement `CopyHash` and use it for the address, deployment hash and rows; make T035
  green.

**Checkpoint**: Overview is complete in recorded and live-mocked modes; its component test is the P1
gate for US1.

---

## Phase 4: US2 — Deal page (P1)

- [ ] **T037** [P] Write the failing accrual tests in `test/accrual.test.ts`: zero at start, midpoint
  floor, cap at end, cap after end, settle stops, tick reconciliation, no backwards movement, block
  scrubber input validation. Create `src/data/accrual.ts` as a stub.
- [ ] **T038** Implement `src/data/accrual.ts`; make T037 green.
- [ ] **T039** Write the failing recorded Deal test in `test/deal.test.tsx` for `/deal/2`: derived
  state `settled`, round label `failed`, index 1, start 35, deadline 45, path length 3, bond 100 → 80
  tPOT, slash 20 tPOT, owner credit 2e19 wei, `answerTx` null → "not recorded", `health` "not
  recorded", the two transaction hashes, and no client. Create `src/pages/Deal.tsx` as a stub.
- [ ] **T040** Implement the recorded Deal page (terms, bond strip, timeline, transactions); make
  T039 green.
- [ ] **T041** [P] Write the failing live Deal test in `test/deal-live.test.tsx`: `dealOf`,
  `challengeStateOf`, `accruedOf`, `healthOf` overlays, health 0–3, health 0–3, the `null` recorded health wording ("not recorded by the run"), the revert fallback,
  stale after 30 s, not-found id, and a failed read that keeps the reported value.
- [ ] **T042** Implement the live Deal overlay; make T041 green.
- [ ] **T043** [P] Write the failing AccrualCounter test in `test/accrual-counter.test.tsx`: anchor
  display, ticking as `SIMULATED`, cap, stop, reduced-motion snap, reserved width (no layout shift).
  Create `src/components/AccrualCounter.tsx` as a stub.
- [ ] **T044** Implement `AccrualCounter`; make T043 green.
- [ ] **T045** [P] Write the failing timeline test in `test/timeline.test.tsx`: round states in order,
  five evidence stages per transaction, copy buttons, refusal-free rendering, and the "not recorded"
  wording. Create `src/components/RoundTimeline.tsx` as a stub.
- [ ] **T046** Implement `RoundTimeline`; make T045 green.
- [ ] **T047** [P] Write the failing health test in `test/health.test.tsx`: all four values, the
  revert fallback, and that no other field disappears. Create `src/components/HealthChip.tsx` as a
  stub.
- [ ] **T048** Implement `HealthChip`; make T047 green.
- [ ] **T049** Add the deal-page block scrubber for active recorded deals (`SIMULATED`), with tests
  for the block range and the label; wire it to `AccrualCounter`.

**Checkpoint**: Deal page is complete; the three hero visuals (counter, tracer, timeline) exist and are
tested. US2's component test is green.

---

## Phase 5: US3 — Verify a file (P1)

- [ ] **T050** [P] Write the failing splitter tests in `test/verify-file.test.ts`: 0 bytes refused,
  1 byte, 1,023, 1,024, 8,192, 8,193, 16 MiB accepted, 16 MiB + 1 refused, leaf count rule, progress
  callbacks, cancellation. Create `src/merkle/verifyFile.ts` as a stub.
- [ ] **T051** Implement the splitter with 1 KiB blocks, yielding every 256 blocks, and progress;
  make T050 green.
- [ ] **T052** Add `src/merkle/shared.ts` as a signature-only re-export that throws
  `not implemented` (so the module resolves and the test fails behaviourally, not on a missing file),
  and write the failing golden-root test in `test/shared-merkle.test.ts`. Commit the red.
- [ ] **T053** Replace the stub with the one-line re-export of `apps/makhzan/src/merkle.ts`; fix the
  alias/dedupe until T052 passes. Record in `research.md` if resolution needed a change (for example
  `optimizeDeps.exclude`). Commit the green.
- [ ] **T054** [P] Write the failing Verify page test in `test/verify.test.tsx`: sample file →
  `MATCH` for deal 1, other file → `MISMATCH`, no-root deal refusal, no `fetch` with file bytes, no
  client construction, sample button, progress and cancel. Create `src/pages/Verify.tsx` as a stub.
- [ ] **T055** Implement the Verify page; make T054 green.
- [ ] **T056** [P] Write the failing Node parity test `test/merkle-parity.test.ts` that reads
  `packages/merkle-vectors/vectors.json` (via the repo path) and checks roots and every path for leaf
  counts 1, 3, 7, 1000 through `src/merkle/shared.ts`. It fails until T053; if T053 is already green,
  this test is written first and must fail against a temporary one-byte prefix mutation, then be
  restored.
- [ ] **T057** Wire the parity test; make T056 green.
- [ ] **T058** [P] Write the browser parity spec
  `test/merkle-parity.browser.test.ts` with the same vectors, run it with `npm run test:browser`, and
  fix bundling/resolution until it is green. Add the browser run to the CI job.
- [ ] **T059** Add `test/sample-root.test.ts`: reads `public/samples/demo-8k.bin`, asserts size and
  root, and asserts the root equals deal 1's committed root in the fixture. This closes the
  judge-without-a-file loop.

**Checkpoint**: US3 is green in jsdom, Node and a real browser; the sample proves the whole path.

---

## Phase 6: US4 — Proof tab (P2)

- [ ] **T060** [P] Write the failing receipt-classification tests in `test/receipts.test.ts`: success,
  reverted, not found/pruned, unknown block/state discarded, timeout, HTTP 500, CORS, null hash. Create
  `src/data/receipts.ts` as a stub.
- [ ] **T061** Implement `src/data/receipts.ts` and `src/components/SignalBadge.tsx`; make T060 green.
- [ ] **T062** Write the failing Proof page test in `test/proof.test.tsx`: deployment table values,
  ten transaction rows, the registration row as `not recorded`, refusal rows neutral with expected
  errors, evidence path on every row, sort/filter. Create `src/pages/Proof.tsx` as a stub.
- [ ] **T063** Implement the recorded Proof page; make T062 green.
- [ ] **T064** [P] Write the failing live cross-check test in `test/proof-live.test.tsx`:
  `getTransactionReceipt` success → measured status/block/gas and finality tag; pruned → exact text;
  transport error → exact text + retry; evidence value untouched. Implement the cross-check in T065.
- [ ] **T065** Implement the live receipt cross-check and retry control; make T064 green.
- [ ] **T066** [P] Write the failing finality-label test: `tag:finalized` versus
  `heuristic(confirmations=N)` wording, and no "finalized" claim from a single confirmation. Fix the
  mapping; commit.

**Checkpoint**: US4 is complete and never converts absence into failure.

---

## Phase 7: US5 — For Judges (P2)

- [ ] **T067** Write the failing Judges content test in `test/judges.test.tsx`: exactly five steps,
  every command matches `quickstart.md`, every evidence path exists on disk, the gas section names the
  Discord/SS58 route and says the app needs no gas, the not-claimed list matches
  `docs/EXPLAIN.md` bullets (continuous storage, distinct copies, randomness, source verification,
  live numbers, audit). Create `src/pages/Judges.tsx` as a stub.
- [ ] **T068** Implement the Judges page, including reusable copy-command controls; make T067 green.
- [ ] **T069** Add `test/explain-sync.test.ts`: parses the "What a pass proves, and what it does not"
  section of `docs/EXPLAIN.md` and fails if a listed limit is missing from the page. Add the
  status-page section to `docs/EXPLAIN.md` in the same commit.

**Checkpoint**: US5 is complete; no claim on the page is unsupported.

---

## Phase 8: US6 — Recorded replay (P3)

- [ ] **T070** [P] Write the failing replay model test in `test/replay-model.test.ts`: frame list from
  blocks 1–56, pass/slash markers, bond change exactly at block 47, settled frames, derived accrual
  per frame, all values `REPORTED`/`SIMULATED` (never `MEASURED`). Create `src/pages/replayModel.ts`
  as a stub.
- [ ] **T071** Implement the replay model; make T070 green.
- [ ] **T072** Write the failing Replay page test in `test/replay.test.tsx`: play/pause/step/scrub,
  keyboard arrows, no autoplay under reduced motion, pause on visibility change, the "recorded, not
  live" header. Create `src/pages/Replay.tsx` as a stub.
- [ ] **T073** Implement the Replay page; make T072 green.
- [ ] **T074** Add the replay's stage tracer and accrual counter reuse test: both render from replay
  frames with the same components as the deal page, no duplicate implementation.

**Checkpoint**: US6 is complete; the replay adds no new facts and no new components.

---

## Phase 9: Cross-cutting quality and release

- [ ] **T075** Write `test/no-network.test.tsx`: renders every route from the injected fixture with `fetch` and
  `createPublicClient` stubbed to throw, asserting each route renders its `h1`, the banner, the legend
  and no error boundary. Add the missing/malformed evidence case, the evidence/live mismatch case
  (FR-062), and the SC-006 DOM audit (every rendered metric has a label and source; no unlabelled
  data value outside narrative counts) to the same file. Fix any route that fails.
- [ ] **T076** Accessibility pass: landmarks, heading order, focus order, copy announcements, table
  captions, contrast tokens, reduced motion. Add `test/a11y.test.tsx` for the structural rules and a
  manual checklist result in the evidence file.
- [ ] **T077** Responsive pass: add `test/responsive.browser.test.ts` at 360, 768, 1280 px and 200 %
  zoom, asserting `document.documentElement.scrollWidth <= innerWidth` and that the mode banner and
  primary controls are visible. Fix layout issues.
- [ ] **T078** Add `scripts/check-bundle.mjs` and `npm run check:bundle`: after `vite build`, fail if
  the initial route JS exceeds 300 KB gzip or if any built asset references a third-party origin.
- [ ] **T079** Add the production route smoke to CI (T007's script) and confirm all six routes return
  the shell directly, with no 404 and no client-side redirect from the server.
- [ ] **T080** Add `npm run check:readonly` as an alias for the guard and wire both the guard and the
  evidence/sample checks into the CI job. Fail the job if any forbidden symbol or hash mismatch exists.
- [ ] **T081** Update `README.md`: a new implemented/simulated/roadmap row for the status app, the
  demo link, the dependency/licence table (`react`, `react-dom`, `react-router-dom`, `viem`,
  `tailwindcss`, `@fontsource-variable/space-grotesk`, `@fontsource/ibm-plex-mono`, and dev tools),
  and the `[ai]` marking. No live claim.
- [ ] **T082** Write `docs/status-ui.md`: the four variables, the mode matrix, Vercel settings, the
  evidence refresh procedure, the read-only surface, the failure states, and the honest limits.
- [ ] **T083** Add the status-page section to `docs/EXPLAIN.md`: what the page proves, what it does not,
  what it costs (nothing), and what the labels mean.
- [ ] **T084** Run the full local gate and save the raw output:
  `npm run typecheck && npm test && npm run test:browser && npm run build && npm run check:evidence &&
  npm run check:sample && npm run check:bundle && npm run smoke` plus
  `forge build --sizes && node scripts/check-size.mjs` in the repo. Paste the real output into
  `evidence/raw/t2/01-status-ui-gate.txt` with the UTC time. If any gate contradicts an assumption in
  this spec, stop and add a decision record to `docs/decisions.md` before changing code.
- [ ] **T085** Record the UI evidence: a route-by-route table (route, mode, evidence file, values
  shown, number of labelled metrics), the fixture SHA-256, the bundle size, and the guard output, in
  `evidence/raw/t2/02-status-ui-evidence.md`. No screenshot is required; no number is invented.
- [ ] **T086** Checkpoint: write the bundle to the sync folder (`CHECKPOINT.md`, `spec.md`, `plan.md`,
  `tasks.md`, `analyze.md`, the fixture, the schema, the gate output), run the secret scan, push the
  branch, and stop for the owner's "go".

---

## Dependencies and order

- Phase 2 blocks all stories. Within Phase 2, T010→T011, T012→T013, T014→T015, T016→T017, T018→T019,
  T020→T021, T022→T023, T024→T025 are strict pairs; T026 can run after T021.
- US1 (Phase 3) depends on T017, T019, T021, T025. US2 (Phase 4) depends on US1's shell and T038.
  US3 (Phase 5) depends on T021 only for the deal root; it must not import the client. US4 depends on
  T023 and T061. US5 depends on T015 and the docs. US6 depends on US2's components.
- Phase 9 depends on every story; T084 is the last executable task before T086.

## Out of scope for this task list

Live deployment, live RPC calls, wallet connection, transactions, a backend, an indexer, analytics,
AI chat, a graph view, file upload to a provider, and any change to `contracts/` or `apps/makhzan/`.
