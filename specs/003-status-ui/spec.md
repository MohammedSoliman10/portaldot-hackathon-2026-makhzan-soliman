# Feature Specification: Makhzan Proof and Status web app

**Feature Branch**: `003-status-ui`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "A read-only static web app (React, Vite, TypeScript, Tailwind, viem for reads, no backend, no wallet, no keys in v1; deployable to Vercel) that lets a judge or visitor verify a Makhzan deployment without any setup. Config only through public `VITE_` variables (RPC URL, chain id 420420777, contract address, mode `LIVE` or `LOCAL` or `RECORDED`). Default mode is `RECORDED`, loaded from versioned evidence JSON in `public/evidence/`; it switches to `LIVE` only when an address is configured, with a loud banner for the active mode. P1 Overview, P1 Deal page, P1 Verify a file in the browser, P2 Proof tab, P2 For Judges page, P3 recorded-replay walkthrough. Every number carries a label (`MEASURED`, `REPORTED`, `SIMULATED`, `PENDING LIVE RUN`). The live RPC is only about 95.5 % reliable: timeouts, retries, a stale indicator, and never a blank page. A chain id mismatch shows a blocking warning. Read-only means no `sendTransaction` code path exists. A parity test runs the shared golden Merkle vectors in the browser build. Accessible and responsive. Dark, clear typography, one confident accent colour, the accrual counter and the stage tracer as the hero visuals, a small Makhzan wordmark. Avoid a generic template look."

## Clarifications

### Session 2026-10-23

Answers are the owner's defaults; no question was left open for clarification.

- Q: What exactly may the app read? → A: Only view calls: `providerOf`, `dealOf`, `challengeStateOf`, `accruedOf`, `healthOf`, `peek`, plus `eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getCode` and `eth_getTransactionReceipt`. No `sendTransaction`, no `writeContract`, no wallet client, no key material, no signing dependency.
- Q: How is the active mode chosen? → A: `VITE_MAKHZAN_MODE` wins when set. When it is unset, the app is `RECORDED` unless a valid `VITE_MAKHZAN_CONTRACT_ADDRESS` is also set, in which case it is `LIVE`. `LOCAL` is only ever explicit. `RECORDED` never constructs an RPC client.
- Q: What happens when `LIVE` is requested without an address, or the address is malformed? → A: A blocking configuration notice and the `RECORDED` evidence are shown together. The app never renders a blank page and never labels evidence values as live.
- Q: What happens on a chain id mismatch? → A: A persistent blocking warning names the expected and observed chain ids and pauses every live read. Recorded evidence stays visible and keeps its `REPORTED` labels; no live value is shown.
- Q: What is "the project's five-state vocabulary"? → A: The deal page and challenge timeline use the daemon's five round labels — `pending`, `submitted`, `passed`, `failed`, `unanswered`. Transaction rows additionally show the evidence pipeline's five stages — `submitted`, `included`, `executed`, `finalized`, `read back`. Both vocabularies are labelled as such and are never mixed in one column.
- Q: How are the four number labels assigned? → A: `MEASURED` for a value read from the configured RPC during this page view (with block and UTC time); `REPORTED` for a value taken from the evidence JSON, with file, environment and evidence UTC; `SIMULATED` for a locally extrapolated value such as an accrual tick between reads; `PENDING LIVE RUN` for a row that has no value because no live run exists. A value is never promoted from `REPORTED` to `MEASURED` without a fresh read.
- Q: What exactly does "code-verified" claim? → A: Only what the evidence proves: at deploy time the runtime length and Keccak code hash matched the recorded artifact. In `LIVE`, the app re-reads `eth_getCode` and compares its Keccak hash with the evidence hash. Source-code verification on a block explorer is not claimed; the local anvil deployment has no explorer.
- Q: Which evidence is the default fixture? → A: The latest local anvil process run, `evidence/raw/t1/87-e2e-process.txt` (2026-10-23T08:21Z; deployment `0x5FbDB2315678afecb367f032d93F642f64180aa3`; 8,192-byte file; one passed and one slashed round; both deals settled). It is the only fixture used for the P1 screens and the replay.
- Q: Is the evidence file fetched over the network in `RECORDED`? → A: Yes, as a same-origin static asset from `public/evidence/`. The no-RPC rule forbids JSON-RPC calls, not loading the app's own static files. "No network" tests assert zero RPC calls and no viem public client; evidence is imported or served by the test harness.
- Q: How does the counter know block time, given the local run did not record block timestamps? → A: It does not pretend to. The fixture records `timing.basis = "node-default"`, and every tick between reads is `SIMULATED`. In `LIVE`, block time is measured from the last five blocks and the label says so. The replay is indexed by block number, not wall-clock time.
- Q: How are old receipts that the RPC no longer serves described? → A: `unavailable (pruned by RPC)` when the node answers that the receipt is unknown because state was discarded; `unavailable (RPC error)` for a transport/timeout error; `not recorded in evidence` when the fixture never captured a hash. None of these is ever styled or worded as a failed transaction.
- Q: How many deals are listed? → A: There is no enumerable deal list on-chain, so the app reads `nextDealId` from packed config slot 0 and lists at most the newest 50 deals. The table states "showing X of Y deals" and never implies completeness.
- Q: What is the file size limit for browser verification? → A: 16 MiB, split into 1 KiB blocks. A larger file is refused before reading it into memory with a plain message. Hashing yields to the event loop every 256 blocks so the page stays responsive.
- Q: Which visual direction is fixed? → A: Ink-black canvas, warm paper text, a single ochre accent, a bundled grotesk for prose and a bundled mono for data, tabular numerals, hairline rules and an index-like layout; no stock dashboard cards, no gradients, no icon library. The accrual counter and the five-stage tracer are the only two "hero" treatments.
- Q: How is the app deployed? → A: A static Vite build to Vercel with the repository root as the Vercel Root Directory (the app imports the shared Merkle module from `apps/makhzan/src/merkle.ts`), build command `npm --prefix apps/status-ui ci && npm --prefix apps/status-ui run build`, output `apps/status-ui/dist`, and SPA rewrites for the client-side routes.
- Q: Is a backend, indexer or analytics allowed? → A: No. No server, no database, no cookies, no analytics, no third-party requests at runtime. Evidence and fonts are bundled or served by the same origin.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Overview (Priority: P1)

A judge opens the deployed URL and, without installing anything, connecting a wallet or knowing the contract, sees which mode is active, which chain and contract the page is talking about, whether the deployed code matches the recorded artifact, the deployment's configuration read from packed slot 0, the provider record, and the deals that exist. The page works with the network unplugged because the recorded evidence is the base layer.

**Why this priority**: A judge decides in the first ten seconds whether the project is real. The overview is the only screen that can establish the mode, the address and the evidence provenance before any other screen is trusted.

**Independent Test**: Serve the production build with no RPC configured. The Overview renders the `RECORDED` banner, the contract address, the code-hash status, `nextDealId = 3`, `providerCount = 1`, the decoded configuration and two deal rows, each number carrying a `REPORTED` label and a source line.

**Acceptance Scenarios**:

1. **Given** a build with no `VITE_MAKHZAN_CONTRACT_ADDRESS`, **When** the page loads, **Then** the banner reads `RECORDED`, shows the evidence UTC and the fixture environment, and no RPC client is created.
2. **Given** a live build with a valid address and a reachable RPC, **When** the page loads, **Then** the banner reads `LIVE`, live values are labelled `MEASURED` with block and time, and the evidence source remains visible for values that were not re-read.
3. **Given** a live build whose RPC reports a different chain id, **When** the first read completes, **Then** a blocking warning names both ids and no live number is shown.
4. **Given** any of the failure cases above, **When** the page renders, **Then** the recorded overview remains readable and the page is never blank.
5. **Given** a deployment record without source verification, **When** the code status is shown, **Then** it says "code hash matched at deploy time" and "source not verified", not "verified contract".

---

### User Story 2 — Deal page (Priority: P1)

A visitor opens one deal and follows it as a story: what was committed, who provides it, what bond stands behind it, how much payment has accrued, how the challenge rounds went, which transactions prove each step, and what `healthOf` says about availability right now.

**Why this priority**: The deal is the unit of the product. It is where the five-state vocabulary, the accrual counter, the stage tracer and the copyable transaction hashes come together.

**Independent Test**: Open `/deal/2` in `RECORDED`. The page shows deal state `settled` (derived from flags), the `failed` round on deal 2 with challenge block 35 and resolve block 47, bond `100 → 80` tPOT (20 % slash), the accrual hero at its final cap, health "not recorded by the run", and every hash copies in one click.

**Acceptance Scenarios**:

1. **Given** a deal with a passed round, **When** the timeline renders, **Then** the round is `passed` only because the evidence's read-back shows the challenge closed and the bond unchanged; the answer transaction is marked `not recorded in evidence` rather than invented.
2. **Given** a deal with a slashed round, **When** the timeline renders, **Then** the round is `failed`, the slash equals 20 % of the pre-resolution bond, and the owner credit is shown with its label and source.
3. **Given** a live deal, **When** `accruedOf` is read successfully, **Then** the counter shows the measured value and ticks forward as `SIMULATED` until the next read, capped at the deal price; after the end block it stops.
4. **Given** a live read older than 30 s or a failed refresh, **When** the page still has a last good value, **Then** that value is shown with a `STALE` badge and the time of the last good read.
5. **Given** a deployment without `healthOf`, **When** the read reverts, **Then** the health field reads "not available on this deployment" and no other field is lost.

---

### User Story 3 — Verify a file in the browser (Priority: P1)

A visitor drops a file and the page splits it into 1 KiB blocks, rebuilds the Merkle root with the same code the CLI and contract use, and compares it with a deal's committed root. Nothing is uploaded and no wallet is involved.

**Why this priority**: This is the only interaction that lets a sceptic reproduce the core commitment themselves. It turns "trust the numbers" into "check the root".

**Independent Test**: Drop the documented 8 KiB sample (all bytes `0x5a`) against deal 1. The computed root equals `0xd6bcfc4d…6325b7`, the screen prints `MATCH`, and the browser devtools network panel shows no request carrying file bytes.

**Acceptance Scenarios**:

1. **Given** a file and a selected deal, **When** the root is computed, **Then** the page shows the file size, block count, expected root, computed root and the match/mismatch verdict.
2. **Given** a file whose root differs, **When** the comparison runs, **Then** the verdict is `MISMATCH` and the page states plainly that the file is not the file committed by that deal.
3. **Given** an empty file, a file over 16 MiB, or a deal with no root, **When** verification is attempted, **Then** a plain explanation is shown and no partial verdict is claimed.
4. **Given** the verification screen, **When** a file is dropped, **Then** no RPC, upload request, analytics event or wallet prompt occurs.
5. **Given** a split of a non-multiple size, **When** the last block is shorter than 1 KiB, **Then** the root matches the shared golden construction and the block count equals `ceil(size / 1024)`.

---

### User Story 4 — Proof tab (Priority: P2)

A reader inspects the raw record behind the claims: deployments, every transaction with its five evidence stages, and the calls the contract refused, each linked to the evidence file that recorded it. When an RPC answers, the page cross-checks receipts; when an old receipt is gone, the page says so without calling it a failure.

**Why this priority**: The overview and deal page summarise; the proof tab is where a technical judge checks that a summary was not staged. It depends on the evidence schema and the transaction model already used by P1.

**Independent Test**: Open `/proof`. The deployment row shows the tx hash, block 1, 6,566 runtime bytes and the code hash. The transaction table shows ten transactions; the daemon's answer transaction for deal 1 is `not recorded in evidence`. A live cross-check of a pruned hash renders `unavailable (pruned by RPC)` in neutral styling.

**Acceptance Scenarios**:

1. **Given** recorded evidence, **When** the proof tab renders, **Then** every row names its evidence file, environment and UTC, and the refusals section lists the expected custom error and the test that produced it.
2. **Given** a reachable RPC and a transaction with a hash, **When** the cross-check runs, **Then** the receipt status, block and gas are shown as `MEASURED`; finality is shown as the `finalized` tag or as `heuristic(confirmations = N)`.
3. **Given** a receipt the RPC cannot serve because of pruning, **When** the cross-check completes, **Then** the row reads `unavailable (pruned by RPC)` and the transaction is not labelled failed.
4. **Given** the RPC is down, **When** the cross-check runs, **Then** the evidence remains visible, the row reads `unavailable (RPC error)`, and a retry control is offered.

---

### User Story 5 — For Judges page (Priority: P2)

A judge gets one page with the five-step verification path, how to obtain test gas, the exact commands to rerun the evidence locally, what the project does not claim, and the honest limits of the proof.

**Why this priority**: It converts scattered README and runbook knowledge into one screen and prevents overclaiming. It is P2 because P1 screens already stand alone without it.

**Independent Test**: Open `/judges`. Count five numbered steps, each with a command and an expected result; find a "not claimed" section that names continuous storage, distinct copies, unpredictability beyond the fallback, source verification and live numbers; find no claim lacking an evidence path.

**Acceptance Scenarios**:

1. **Given** the judges page, **When** a command is copied, **Then** it is the same command recorded in the evidence or runbook, including the local chain id.
2. **Given** a live number that does not exist, **When** the page lists it, **Then** it is labelled `PENDING LIVE RUN` and not rendered as a dash that could read as zero.
3. **Given** the limits section, **When** it describes continuous storage and distinct copies, **Then** the wording matches `docs/EXPLAIN.md` and cites it.

---

### User Story 6 — Recorded replay (Priority: P3)

A visitor plays the recorded pass and slash rounds as a block-indexed walkthrough: challenge opens, the daemon answers or does not, the round resolves, the bond moves or does not, the deal settles. Every frame is labelled `REPORTED` and the player never implies a live run.

**Why this priority**: It is the demo without the demo machine. It is P3 because the deal page already tells the same story statically; the replay adds pacing, not new facts.

**Independent Test**: Open `/replay`, press play, and reach the slash frame at block 47 with the bond dropping from 100 to 80 tPOT. Pause, scrub back to block 35, and see the open challenge with deadline 45.

**Acceptance Scenarios**:

1. **Given** the replay, **When** it autoplays, **Then** motion respects `prefers-reduced-motion` and the player pauses when the tab is hidden.
2. **Given** any replay frame, **When** it displays a value, **Then** the value is `REPORTED` and the frame names the source evidence and block number.
3. **Given** a recorded refusal, **When** the replay reaches it, **Then** it is shown as a refused call, not as a failed transaction.

---

### Edge Cases

- No evidence file, malformed JSON, unknown schema version, or an unknown field: a blocking evidence notice, a retry, and never a blank page.
- Evidence manifest hash mismatch: a warning that the file is not the reviewed copy, while the values remain visible as `REPORTED` and clearly marked unverified.
- `LIVE` mode with no address, a malformed address, or an address with no code: configuration notice; live reads disabled; recorded data still shown.
- Chain id mismatch: blocking warning, live reads paused, recorded data visible.
- RPC timeout, HTTP 5xx, CORS failure, or a node that prunes state: bounded retries, stale badge on last good values, and an explicit error string.
- A transaction hash present in evidence but absent from the node: `unavailable (pruned by RPC)` after the node says the receipt is unknown; `unavailable (RPC error)` after a transport failure.
- `healthOf` missing on an older deployment: "not available on this deployment", other fields unaffected.
- `nextDealId` very large: only the newest 50 deals are read, and the table states the count.
- A file larger than 16 MiB, an empty file, or a directory drop: refused before reading, plain message.
- A file whose size is an exact multiple of 1 KiB: leaf count equals the block count and the last leaf is full.
- A deal that is settled: accrual stops at the price, a live `healthOf` reads 0, the fixture has no recorded health value, and no tick animation runs.
- A challenge still open at the end block: the timeline shows the open challenge and does not infer an outcome.
- Clipboard API unavailable in an insecure context: a visible, selectable hash and a "select and copy" fallback.
- 200 % zoom, 360 px width, keyboard-only use, and screen-reader navigation: no clipping, no focus trap, no horizontal scrolling.
- Reduced motion: the counter snaps between values, the replay does not autoplay, and the stage tracer does not animate.
- Static hosting without SPA rewrites: every route still resolves (the deployment test opens each route directly).

## Requirements *(mandatory)*

### Configuration, modes and honesty

- **FR-001**: The app MUST be a static React + Vite + TypeScript + Tailwind build with no backend, no database, no cookies and no analytics.
- **FR-002**: Configuration MUST come only from public build-time variables: `VITE_MAKHZAN_MODE`, `VITE_MAKHZAN_RPC_URL`, `VITE_MAKHZAN_CHAIN_ID` (default `420420777`) and `VITE_MAKHZAN_CONTRACT_ADDRESS`. No other runtime configuration or secret is read.
- **FR-003**: Mode resolution MUST be: explicit `VITE_MAKHZAN_MODE` wins; otherwise `LIVE` only if a valid contract address is set; otherwise `RECORDED`. `LOCAL` MUST be explicit. `RECORDED` MUST NOT create an RPC client.
- **FR-004**: A persistent, high-contrast banner MUST state the active mode, the chain id, the RPC host (when live), and the evidence file and UTC (when recorded).
- **FR-005**: `LIVE`/`LOCAL` with a missing or malformed address MUST show a blocking configuration notice together with the recorded evidence; no live value may be shown.
- **FR-006**: A chain id that differs from the expected id MUST raise a blocking warning naming both ids and MUST pause live reads. It MUST NOT hide the recorded evidence.
- **FR-007**: The app MUST NOT contain a transaction-sending, signing, wallet-connecting or key-loading code path. `window.ethereum` MUST NOT be referenced; no wallet library may be a dependency.
- **FR-008**: In `LIVE`, the code status MUST re-read `eth_getCode` and compare its Keccak-256 hash with `deployment.codeHash` from the evidence. A mismatch MUST be a blocking warning. The label MUST NOT say "source verified".
- **FR-009**: The evidence file MUST be versioned (`makhzan.evidence/v0`), listed in `public/evidence/index.json` with a SHA-256, and validated strictly before use. Unknown top-level keys, missing keys, wrong types, bad lengths and unsupported versions MUST be rejected.
- **FR-010**: Evidence hash mismatch MUST be surfaced as a warning, not silently accepted and not used to hide the page.

### Evidence and labels

- **FR-011**: Every displayed number MUST be rendered through one `Metric` primitive that requires a label from `MEASURED | REPORTED | SIMULATED | PENDING LIVE RUN` and a source string. Plain unlabelled numeric text is a defect.
- **FR-012**: `REPORTED` values MUST name the evidence file, environment and UTC; `MEASURED` values MUST name the block number and UTC of the read; `SIMULATED` values MUST name what they were derived from; `PENDING LIVE RUN` MUST be text, not a zero or a dash.
- **FR-013**: The four labels and the two five-state vocabularies MUST be explained in a reachable legend (footer plus an inline help affordance).
- **FR-014**: The evidence base layer MUST load before live reads so that a failed, slow or mismatched RPC still leaves a complete page.
- **FR-015**: The evidence contract MUST be the draft schema in `specs/003-status-ui/contracts/evidence-schema.md` (`v0`), copied to `docs/evidence-schema.md` in the implementation phase before the first fixture is added to the app.

### Overview (US1)

- **FR-016**: The Overview MUST show the mode banner, the contract address with a copy control, the chain name/id and the deployment transaction hash.
- **FR-017**: The Overview MUST show the code status derived from `deployment.codeVerified` (and, in live mode, the fresh `eth_getCode` comparison).
- **FR-018**: The Overview MUST decode packed config slot 0 (`challengeWindow`, `challengeBlockSize`, `slashBps`, `minBond`, `nextDealId`, `providerCount`, `minDurationBlocks`, `maxDurationBlocks`) using one shared decoder with a golden slot value, and MUST call `peek([0])` in live mode rather than trusting the evidence copy.
- **FR-019**: The Overview MUST call `providerOf(address)` for the evidence provider and show id, bond, active deals and registration; in recorded mode the same values are `REPORTED`.
- **FR-020**: The deals table MUST list at most the newest 50 deals by id from `nextDealId`, state the shown/total counts, and link each row to its deal page.
- **FR-021**: The stage tracer MUST be a visible hero on the Overview and MUST show the five evidence stages for the deployment transaction, with every stage that was not observed left explicitly unobserved.

### Deal page (US2)

- **FR-022**: The deal page MUST use the five round labels (`pending`, `submitted`, `passed`, `failed`, `unanswered`) for rounds, and the five evidence stages for transactions, in separate columns.
- **FR-023**: The deal page MUST show owner, provider id and address, root, leaf count, size, block size, start and end block, price, claimed amount, settled flag and derived deal state (`active`, `expired`, `settled`).
- **FR-024**: The deal page MUST show the provider bond before and after each round and the 20 % slash arithmetic where a slash exists.
- **FR-025**: The accrual counter MUST use `accruedOf(dealId)` as its anchor, tick between reads only as `SIMULATED`, cap at the price, stop at the end block or on settlement, and reconcile to every fresh read without drifting.
- **FR-026**: The challenge timeline MUST show challenge index, start block, deadline, expected path length, the answer/resolve transaction and the outcome read-back.
- **FR-027**: Every transaction hash MUST have a copy control with an accessible confirmation and a selectable fallback when the Clipboard API is unavailable.
- **FR-028**: `healthOf(dealId)` MUST be shown as a four-value vocabulary (0 unknown/settled, 1 healthy, 2 challenge pending, 3 in default) when the call succeeds; a revert MUST render "not available on this deployment", and a `null` recorded health MUST render "not recorded by the run". Neither case may show a healthy state.
- **FR-029**: A deal id outside the known range MUST show a plain "no deal with that id" panel with a link back to the Overview, not an error stack.
- **FR-030**: When a value cannot be read, the field MUST say so with a label and a reason; it MUST NOT silently render 0 or an empty cell.

### Verify a file (US3)

- **FR-031**: The verifier MUST accept a dropped or selected file, read it locally, split it into 1 KiB blocks, and compute the root with the shared library imported from `apps/makhzan/src/merkle.ts` (the same `buildTree`, `leafHash` and `nodeHash` used by the CLI).
- **FR-032**: The verifier MUST compare against the selected deal root and print `MATCH` or `MISMATCH` with size, block count, expected root and computed root.
- **FR-033**: The verifier MUST NOT upload, persist, log or transmit the file or its blocks; no RPC call may include file bytes.
- **FR-034**: Empty files, files over 16 MiB, and deals without a root MUST be refused before hashing with a plain explanation.
- **FR-035**: Hashing MUST yield to the event loop so the page remains responsive, and MUST show progress; it MUST NOT freeze the interface for the 16 MiB limit.
- **FR-036**: The verifier MUST support both a generic check (no deal selected) and a deal-specific check reached from the deal page.

### Proof tab (US4)

- **FR-037**: The Proof tab MUST list deployments, transactions and refusals from the evidence, each with its evidence file, environment, UTC and label.
- **FR-038**: Transaction rows MUST show the five evidence stages; a stage that was not observed MUST be rendered as "not recorded" and never as passed.
- **FR-039**: A live cross-check MUST be available per transaction when the RPC answers, using `eth_getTransactionReceipt`; finality MUST be the `finalized` tag or `heuristic(confirmations = N)`.
- **FR-040**: Receipt unavailability MUST distinguish three causes — `unavailable (pruned by RPC)`, `unavailable (RPC error)`, `not recorded in evidence` — and MUST never render as a failed transaction.
- **FR-041**: Refusals MUST show the attempted call, the expected custom error from `imakhzan.md`, the verbatim revert reason when available, and the evidence source; a refusal MUST NOT be shown as an on-chain failed transaction.

### For Judges (US5)

- **FR-042**: The page MUST present exactly five numbered verification steps, each with a command, an expected result and the evidence file it reproduces.
- **FR-043**: The page MUST explain how to get test gas without implying the app can request it, and MUST state that the v1 app never spends gas.
- **FR-044**: The page MUST list what is not claimed, matching `docs/EXPLAIN.md`: continuous storage, distinct copies, unpredictability beyond the D5 fallback, explorer source verification, live numbers, and any audit. At least one row MUST show the `PENDING LIVE RUN` label for a value that does not exist yet (the live fee/round row), so the fourth label is exercised by the UI and not merely declared.
- **FR-045**: Every claim on the page MUST link to evidence that exists in the repository; a claim without evidence MUST be removed rather than softened.

### Recorded replay (US6)

- **FR-046**: The replay MUST present the recorded passed round and slashed round against a block-number axis with play, pause, scrub and step controls.
- **FR-047**: Every replay value MUST be `REPORTED`; the replay MUST state that it is a recording and MUST never suggest a live run.
- **FR-048**: Autoplay MUST be off when `prefers-reduced-motion` is set, MUST pause when the document is hidden, and MUST be keyboard-operable.

### Reliability, read-only and quality

- **FR-049**: Every RPC read MUST have a 4 s timeout, at most 2 retries with backoff, an abort path on unmount, and a circuit breaker that stops hammering an unavailable node.
- **FR-050**: Live values older than 30 s, or values served after a failed refresh, MUST carry a visible `STALE` badge with the last-good time.
- **FR-051**: No failure path may render an empty page: route-level error boundaries, skeletons for first loads, and recorded fallback content are mandatory.
- **FR-052**: A read-only guard test MUST fail if `sendTransaction`, `writeContract`, `createWalletClient`, `privateKeyToAccount`, `window.ethereum`, `eth_sendTransaction` or a signing dependency appears in `src/` or in the dependency list. A second guard MUST fail if any `readContract` call names a non-view ABI function.
- **FR-053**: The UI MUST meet WCAG 2.2 AA: keyboard reachability, visible focus, landmarks, labelled controls, 4.5:1 text contrast, no motion without a reduced-motion path, and no meaning conveyed by colour alone.
- **FR-054**: The layout MUST work at 360 px, 768 px and 1280 px without horizontal scrolling, and at 200 % zoom.
- **FR-055**: The initial route's JavaScript MUST stay under 300 KB gzip, and the app MUST NOT fetch any third-party runtime resource (fonts are bundled).
- **FR-056**: A parity test MUST run the shared golden vectors (`packages/merkle-vectors/vectors.json`: leaf counts 1, 3, 7 and 1000) through the exact Merkle module used by the browser build, in a real browser environment, plus a Node run for CI. Both MUST cover roots and every path.
- **FR-057**: A build MUST fail if the evidence fixture does not validate, if the evidence SHA-256 in the manifest does not match, or if the read-only guard finds a forbidden symbol.
- **FR-058**: The app MUST disclose in its README section every third-party library and its licence, and mark AI-assisted code.
- **FR-059**: The implementation MUST add a `docs/status-ui.md` with the Vercel settings, the four variables, the mode matrix, the evidence refresh procedure, and the honest limits of the app.
- **FR-060**: `LIVE` and `LOCAL` MUST require both a valid contract address and an RPC URL; a missing RPC URL is a blocking configuration notice with the recorded base layer, never a silent default.
- **FR-061**: A contract address with no deployed code (`eth_getCode` returns `0x`) MUST be a blocking configuration notice, not an empty live page.
- **FR-062**: When the evidence bundle does not describe the active deployment (its `chain.chainId` or `deployment.address` differs from the live chain or configured address), the app MUST warn that the evidence is for another deployment, MUST NOT present its deals or provider as live values, and MUST still render the live identity/config reads. Live deals MAY be listed from `nextDealId` and `dealOf` with no evidence fallback; a provider address that is not in evidence is shown as "provider address not in evidence".
- **FR-063**: An unknown route MUST render a not-found page inside the shell with links to Overview and Verify; it MUST NOT render an empty outlet.

### Key Entities

- **Mode**: `RECORDED | LOCAL | LIVE`, resolved from build-time variables; carries the banner text, whether an RPC client exists, and whether live writes to the UI are allowed.
- **EvidenceBundle**: the validated contents of one versioned JSON file: environment, chain, deployment, config slot, providers, deals, rounds, transactions, refusals, timing basis and limits.
- **Metric**: a value plus unit, label, source and timestamp; the only way a number reaches the screen.
- **DealView**: the merged view of one deal from evidence and live reads, with per-field provenance and staleness.
- **Round**: one challenge round with its five-label state, index, window, transactions, bond delta and read-back.
- **TransactionView**: a hash plus its five evidence stages, receipt state (`available`, `not-recorded`, `unavailable-pruned`, `unavailable-error`), finality method and copy state.
- **Refusal**: an attempted call that the contract rejected, with the expected error, the verbatim reason and its evidence source.
- **ReadResult**: a live read result with `value`, `block`, `at`, `label`, `stale` and `error`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A judge opens the production URL with no wallet, no RPC and no setup; the Overview, a deal page and the verifier all render from evidence within 2.5 s on a cold cache.
- **SC-002**: No tested failure (missing evidence, bad schema, hash mismatch, missing address, wrong chain id, RPC timeout, pruned receipt, `healthOf` revert) produces a blank page or an unlabelled number.
- **SC-003**: Dropping the documented 8 KiB sample yields `MATCH` against deal 1's root; dropping a one-byte-different file yields `MISMATCH`; the network panel shows no file bytes leaving the page.
- **SC-004**: The Merkle parity test passes for leaf counts 1, 3, 7 and 1000 (roots and every path) in both the browser and Node runs, against the shared vector file.
- **SC-005**: A source scan finds zero occurrences of the forbidden write/sign/wallet symbols, and the dependency list contains no wallet or signing library.
- **SC-006**: Every data value in a recorded render is emitted by `Metric` with one of the four labels and a source; a test fails on a metric without a label, and a DOM audit finds no unlabelled data value outside narrative counts.
- **SC-007**: With the RPC stopped mid-session, live values acquire a `STALE` badge within 30 s, the last good values remain readable, and no route throws.
- **SC-008**: A chain id mismatch renders a blocking warning and zero live values, while the recorded Overview stays complete.
- **SC-009**: Keyboard-only traversal reaches every control on the three P1 screens; focus is visible; the copy confirmation is announced; axe-equivalent manual checks pass at 200 % zoom.
- **SC-010**: All six routes open directly from a static server with SPA rewrites (no 404) in the production build.
- **SC-011**: The evidence fixture validates against `v0`, its SHA-256 matches the manifest, and CI fails when either is broken.
- **SC-012**: The Judges page lists five steps, each with a command and its evidence file, and a "not claimed" list that matches `docs/EXPLAIN.md`.

## Assumptions

- The default deployment is `RECORDED`; a live review requires a redeploy with the address variable, because Vite variables are baked into the build.
- The public RPC is about 95.5 % reliable and prunes old state (DR-001); the app treats timeouts and pruning as normal states, not exceptional ones.
- The evidence fixture comes from the latest local anvil process run (`87-e2e-process.txt`, 2026-10-23T08:21Z). It is local evidence and must never be described as a live run.
- The local run did not record block timestamps. Counter ticks are therefore `SIMULATED`, and the replay is block-indexed.
- The 8 KiB sample is deterministic: 8,192 bytes of `0x5a`, root `0xd6bcfc4d0c933f0680ec2e7b1c0ea8aecba797de45bf726ae0ca4c8c286325b7`.
- `WEI_PER_UNIT = 10_000` remains an assumption until G07; amounts are shown in native units and, where wei is shown, the conversion is labelled.
- `healthOf` exists on the fixture deployment (runtime 6,566 B) but not on every older deployment; the UI degrades honestly.
- The site is served over HTTPS (Vercel) or localhost, so the Clipboard and SubtleCrypto APIs are available; fallbacks still exist.
- The browser is a current evergreen browser with ES2022 support.
- The app is read-only in v1; any future write path is a new feature with its own tests and threat model.

## Out of Scope

- Wallet connection, transactions, signing, keys, faucet calls, claims or any write path.
- Backend, API routes, database, indexer, cron jobs, server-side rendering and analytics.
- AI chat, graph view, file upload to a provider, file storage, and any unlabelled mock data.
- Explorer source verification or a deployed-code claim beyond the runtime hash comparison.
- Multi-chain support, theming, internationalisation and user accounts.
- Live deployment, live rounds or any live number; the feature is local/recorded only and a live run stays gated by 002's runbook.
