# Research and Decisions — 003-status-ui

**Feature**: Makhzan Proof and Status web app | **Stage**: plan (pre-implementation)

Each decision below fixes a choice the spec left open. None of them changes feature 002's contract,
CLI or evidence.

## D-01 — Evidence-first rendering, live overlay second

**Decision.** Load and validate the evidence bundle first and render every route from it. In
`LIVE`/`LOCAL`, issue view calls and annotate each field with its live value, block and timestamp; do
not wait for a "page load" promise that can fail. A failed live read leaves the reported value visible
and marks it `STALE` after 30 s.

**Why.** The RPC is ~95.5 % reliable and prunes state (DR-001). A single loading gate turns an RPC
outage into a blank page, which the spec forbids. A per-field overlay also makes the label honest:
the user can see exactly which numbers were measured now and which are reported.

**Rejected.** A conventional "fetch everything, then render" screen; a service worker cache (adds
staleness without provenance).

## D-02 — Import `apps/makhzan/src/merkle.ts` directly, do not copy it

**Decision.** Expose the shared module through a Vite alias `@makhzan/merkle` →
`../makhzan/src/merkle.ts`, with TypeScript `paths`, `resolve.dedupe: ['viem']` and
`server.fs.allow` set to the repository root. `src/merkle/shared.ts` is a one-line re-export so the
app has a stable internal import and the alias is used in exactly one place.

**Why.** The requirement is "the same Merkle code", and the constitution treats drift between the two
implementations as a defect (Principle XVI). A copy would pass today and diverge silently later. The
module is pure TypeScript and already runs in Node; it imports only `viem`'s `keccak256`,
`concatBytes`, `hexToBytes` and `bytesToHex`, all browser-safe.

**Cost.** The app depends on a path outside its directory, so the Vercel Root Directory must be the
repository root, and both packages must be installed in CI. Recorded in Complexity Tracking.

**Rejected.** Copying the module; extracting `packages/merkle` now (would touch feature 002's imports,
tests and golden-vector generator, which is out of scope for this tier).

## D-03 — Browser parity with Vitest browser mode and Playwright

**Decision.** Keep the fast Node parity spec (`test/merkle-parity.test.ts`) and add one browser spec
(`test/merkle-parity.browser.test.ts`) run by `npm run test:browser` under Vitest browser mode with
Playwright Chromium. Both read `packages/merkle-vectors/vectors.json` and assert roots and every path
for leaf counts 1, 3, 7 and 1000. The browser job installs Chromium in CI; it is not part of the
Vercel build.

**Why.** A jsdom run does not prove the browser bundle resolves the module and `viem` correctly. One
real-browser test is the minimum honest proof of "in the browser build".

**Rejected.** A Node-only test labelled "browser"; a hand-written test page outside the test runner
(untracked, easy to skip).

## D-04 — Two five-state vocabularies, never mixed

**Decision.** Rounds use `pending | submitted | passed | failed | unanswered` (the daemon vocabulary
from `apps/makhzan/src/state.ts` and `contracts/cli-daemon.md`). Transactions use
`submitted | included | executed | finalized | read back` (the evidence pipeline from
`apps/makhzan/src/status.ts`). The deal page gives them separate columns with headings that name the
vocabulary; the legend explains both.

**Why.** The phrase "the project's five-state vocabulary" refers to two real five-state sets. Merging
them would invent a sixth state or hide the distinction between "the round passed" and "the receipt
was finalized".

## D-05 — Label assignment is mechanical

**Decision.**

| Source | Label |
| --- | --- |
| A successful RPC read during this view | `MEASURED` (+ block, UTC) |
| A field from the evidence bundle | `REPORTED` (+ file, environment, evidence UTC) |
| A value extrapolated between reads (accrual tick, replay frame) | `SIMULATED` (+ basis) |
| A row with no value because no live run exists | `PENDING LIVE RUN` (text) |

A read that returns a cached last-good value keeps its original label and adds `STALE`, never
`MEASURED` again.

**Enforcement.** `Metric` requires `label` and `source` at the type level. A test renders the three P1
screens and scans every element that looks numeric; an unlabelled number fails the test.

## D-06 — Mode matrix

**Decision.**

| `VITE_MAKHZAN_MODE` | address | result |
| --- | --- | --- |
| unset | absent/invalid | `RECORDED` |
| unset | valid | `LIVE` |
| `RECORDED` | any | `RECORDED` (no client created) |
| `LIVE`/`LOCAL` | valid | that mode |
| `LIVE`/`LOCAL` | absent/invalid | config notice + `RECORDED` data |

`LOCAL` is never inferred. The chain id defaults to `420420777` and is shown even when the mode is
`RECORDED`. Vite variables are build-time, so changing mode is a redeploy, and `docs/status-ui.md`
says so.

## D-07 — Packed slot 0 is decoded in one place

**Decision.** `peek([0])` returns a `bytes32`; `src/data/peek.ts` decodes, least-significant byte
first: `challengeWindow (4) | challengeBlockSize (2) | slashBps (2) | minBond (8) | nextDealId (4) |
providerCount (2) | minDurationBlocks (4) | maxDurationBlocks (4)`, 30 bytes used. A golden unit test
uses the fixture value `0x0000000003e80000000a000100000003002386f26fc1000007d004000000000a` and the
eight expected fields.

**Why.** Two independent decoders (Overview and Deal) would drift. The layout is already normative in
`specs/002-core-storage-proofs/contracts/storage-layout.md`.

**Risk.** A future packing change breaks the test first, which is the intended alarm.

## D-08 — Deal enumeration is bounded and labelled

**Decision.** `nextDealId` comes from slot 0. The list reads ids `max(1, nextDealId-50)…nextDealId-1`,
newest first, and prints "showing X of Y deals". A deal id route outside the range prints "no deal with
that id". No attempt is made to enumerate providers by id; the provider address comes from the
evidence and is confirmed with `providerOf(address)`.

**Why.** There is no enumerable list on-chain and no indexer in scope. Bounded reads keep the page
fast on a chain with many deals.

## D-09 — Reliability envelope

**Decision.** viem transport: `timeout: 4000`, `retryCount: 2`, `retryDelay: 300`; each read is also
wrapped in an `AbortController` tied to the component. A circuit breaker opens after 3 consecutive
failures for 30 s and shows a retry control. Polling is 12 s for the deal page and on-demand for the
proof cross-check. The stale threshold is 30 s (twice the polling interval).

**Why.** The node is not reliable enough for a single-shot load, and retry storms make it worse.
Two retries plus a backoff covers a transient miss without hiding a sustained outage.

## D-10 — Receipt classification

**Decision.** `classifyReceipt(error)` returns one of:

| Condition | UI text | Style |
| --- | --- | --- |
| receipt returned | status + block + gas, `MEASURED` | normal |
| viem "transaction receipt not found"/unknown block, or node reports pruned state | `unavailable (pruned by RPC)` | neutral, dashed rule |
| timeout / HTTP / CORS / connection error | `unavailable (RPC error)` | neutral, retry offered |
| no hash in evidence | `not recorded in evidence` | neutral, no retry |

None of these sets a "failed" style or word. A reverted transaction is the only "failed execution"
state, and it comes from `receipt.status`, never from absence.

## D-11 — Evidence integrity manifest

**Decision.** `public/evidence/index.json` lists the current file and its SHA-256. The loader computes
SHA-256 over the fetched bytes with `crypto.subtle` (falling back to a bundled pure-TS SHA-256 only if
SubtleCrypto is unavailable; the fallback is tested against a known vector). A mismatch shows a
warning and labels the bundle "unverified"; it does not block the page, because hiding evidence is
worse than showing it with a caveat.

**Why.** Static files are mutable at the origin. A judge can compare the manifest hash with the
repository copy.

## D-12 — Read-only guard

**Decision.** Two guards:

1. A source/dependency scan (`test/readonly-guard.test.ts`) fails on `sendTransaction`,
   `writeContract`, `createWalletClient`, `privateKeyToAccount`, `mnemonicToAccount`,
   `window.ethereum`, `eth_sendTransaction`, `eth_requestAccounts`, `eth_sign`, `personal_sign`, or a
   dependency named `wagmi`, `@wagmi/*`, `@rainbow-me/*`, `ethers`, `web3`, `@solana/*`.
2. An ABI/function-usage test asserts every `readContract` `functionName` is one of the seven view
   functions and that no other contract write helper is called.

**Why.** "No `sendTransaction` code path" must be checkable, not a promise. A dependency scan also
catches a wallet library added for a "small" feature later.

## D-13 — Visual language

**Decision.** A ledger, not a dashboard. Ink `#0B0C0B`, paper `#EDE7DA`, ash `#8C877C`, ochre accent
`#D9A441`; one semantic red `#E5484D` only for blocking errors. Space Grotesk (prose, bundled) and
IBM Plex Mono (data, tabular numerals, bundled). A 12-column grid with a numbered left index, hairline
rules instead of cards, no drop shadows, no gradients, no icon set (inline 16 px SVG where needed).
The wordmark is `MAKHZAN` in letterspaced grotesk with `مخزن` at 0.75 em, used once in the shell.
Hero treatments: the accrual counter (large tabular number, unit stacked, per-block pulse) and the
stage tracer (five segments, current stage in ochre, unobserved stages hatched). Motion is limited to
these two, 160–240 ms, and removed under `prefers-reduced-motion`.

**Why.** The requirement is to avoid a generic template. A ledger metaphor matches bonded storage and
makes the data the ornament. One accent plus semantic red is the smallest palette that stays
accessible.

## D-14 — File verification limits

**Decision.** Accept at most 16 MiB (16,384 blocks). Refuse directories, empty files and larger files
before reading. Read the file as an `ArrayBuffer` once, then process 256 blocks per macrotask with a
progress bar; never put file bytes in a React state tree. Compare the root to the selected deal (or
show the computed root alone). Ship `public/samples/demo-8k.bin` (8,192 bytes of `0x5a`,
root `0xd6bcfc4d…6325b7`) with a generator command in the README.

**Why.** 16 MiB is small enough to hash in a few seconds in the browser and large enough to be a real
file. The sample makes the verifier testable by a judge without any other artifact.

## D-15 — Vercel and routing

**Decision.** Vercel project Root Directory = repository root; install command
`npm --prefix apps/makhzan ci && npm --prefix apps/status-ui ci`; build
`npm --prefix apps/status-ui run build`; output `apps/status-ui/dist`; a root `vercel.json` rewrites all
paths to `/index.html`. Client routes are real paths (`/deal/:id`), not hashes, with a skip link and
`document.title` updates. A production smoke test serves `dist/` with a static server and opens every
route directly.

**Why.** The shared import lives outside the app, and the evidence URLs are absolute. Installing
`apps/makhzan` keeps viem resolution unambiguous even without dedupe.

## D-16 — Fixture choice

**Decision.** Use `87-e2e-process.txt` (2026-10-23T08:21Z) as the only fixture: it is the latest run,
it includes `healthOf` in the deployed bytecode (6,566 B), and it contains both a passed and a slashed
round plus both settlements. The provider registration hash and block were not printed, so they are
stored as `null`/`not-recorded`, not invented.

**Why.** Mixing the 1 MiB run (2026-10-21, pre-`healthOf`) with the current deployment would create a
fictional chain state. The app's honesty rule starts with its own fixture.

## D-17 — Block time and the counter

**Decision.** The fixture's `timing.basis` is `node-default`, so the recorded counter never claims a
measured block time. On a settled deal the counter shows the final value. On an active recorded deal
the page offers a block scrubber and labels the result `SIMULATED`. In `LIVE`, block time is the mean
of the last five block timestamps and is labelled `MEASURED`; between reads the ticks are
`SIMULATED` and reconcile on the next anchor.

**Why.** Anvil mined on demand and the run did not record timestamps. Pretending to know the rate
would be the exact kind of unlabelled number the spec forbids.

## D-18 — Testing strategy

**Decision.** Unit tests for every data module and label rule; component tests for Overview, Deal and
Verify (the three P1 screens); a no-network recorded render test that injects the fixture and mocks
`fetch` and `createPublicClient` to throw; the parity pair; the read-only guard; and a build smoke
test. Test-first per module: each test is committed failing for a behavioural reason before the
implementation commit.

**Rejected.** Snapshot-only tests (they bless mistakes), and E2E against a real RPC (out of scope and
forbidden in this stage).
