# UI Contract — 003-status-ui

**Feature**: Makhzan Proof and Status web app | **Scope**: v1, read-only, static

This file is the design contract the implementation and its tests share. It names every route, the
state each screen must render, and the things the app may not do.

## Routes

| Route | Screen | Priority | Evidence-only | Live overlay |
| --- | --- | --- | --- | --- |
| `/` | Overview | P1 | yes | config, provider, deal counts, code hash |
| `/deal/:id` | Deal | P1 | yes | deal, challenge, accrual, health, bond |
| `/verify` and `/verify/:dealId` | Verify a file | P1 | yes | none (deal root only) |
| `/proof` | Proof | P2 | yes | receipt cross-check |
| `/judges` | For Judges | P2 | yes | none |
| `/replay` | Recorded replay | P3 | yes | none |
| `*` | Not found (inside the shell, links to Overview and Verify) | — | — | — |

The shell is persistent: a fixed mode banner at the top, a numbered left index on desktop, the
`MAKHZAN / مخزن` wordmark, and a footer with the evidence id, build id, label legend and the honest
one-liner "read-only: this page cannot sign, send or spend".

## Mode banner (always visible)

| Mode | Wording | Treatment |
| --- | --- | --- |
| `RECORDED` | `RECORDED — local anvil evidence, 2026-10-23T08:21Z. No RPC is being read.` | paper text on ink, ochre rule, diagonal hatch marker |
| `LOCAL` | `LOCAL — 127.0.0.1, chain 420420777. Reads only.` | ochre banner, ink text |
| `LIVE` | `LIVE — chain 420420777 via <host>. Reads only.` | ochre banner, ink text |
| config problem | `CONFIG — <what is missing>. Showing recorded evidence.` | blocking notice under the banner, semantic red rule |
| chain mismatch | `CHAIN MISMATCH — expected 420420777, node reports <id>. Live reads paused.` | blocking notice, semantic red rule |
| evidence mismatch | `EVIDENCE — this bundle describes <chain/address>, not the configured deployment. Live values have no recorded fallback.` | blocking notice, ochre + hatch |

The banner is not dismissible. It is an `aria-live="polite"` region for changes and a landmark for
screen readers.

## Screen: Overview

Order of content:

1. **Hero strip**: wordmark, one sentence ("Bonded, challenged storage on Portaldot — verified
   locally.") and the *stage tracer* for the deployment transaction. Every stage shows observed /
   not observed.
2. **Identity row**: contract address with copy, chain name/id, deployment block and tx hash, code
   status (`code hash matched at deploy time` + `source not verified`), evidence id.
3. **Config row**: window, block size, slash share, minimum bond, duration range, `nextDealId`,
   `providerCount` — each a `Metric`; live values come from decoded `peek([0])`.
4. **Provider row**: id, address (copy), bond, active deals, registered; live from `providerOf`.
5. **Deals table**: id, state, provider, size, price, health, round outcome; newest first; caption
   "showing X of Y deals". Row links to `/deal/:id`.

Empty state: `no deals recorded` with the evidence source. Error state: evidence notice + retry.
Loading state: skeleton rows with the same column labels; the banner and legend are present
immediately.

## Screen: Deal

1. **Header**: deal id, derived state chip (`active | expired | settled`), health chip, provider
   address, owner (truncated + copy).
2. **Accrual hero**: the large numeric counter with unit, label, source and (for live) the block/time
   of the anchor; a small "payment accrues per block" caption; a block scrubber in `RECORDED` for
   active deals, labelled `SIMULATED`.
3. **Terms grid**: root (copy), leaf count, size, block size, start/end block, price, claimed.
4. **Bond strip**: before/after per round, slash, owner credit, and the 20 % arithmetic shown as text
   (`floor(bond × 2000 / 10000)`).
5. **Challenge timeline**: vertical, one block per round. Each block: round label from the five round
   states, index, start, deadline, path length, tx hashes with copy, read-back line. `answerTx = null`
   renders "answer transaction not recorded in evidence".
6. **Transactions**: the deal's transactions with five evidence stages and receipt state.

Not-found: `no deal with that id` + link to Overview. `healthOf` revert: chip "not available on the
deployment"; `health: null` in evidence: "not recorded by the run"; both carry a note that the field
is optional. A failed field: reason text, never `0`.

## Screen: Verify

1. **Drop zone**: `<input type="file">` plus drag-and-drop, keyboard operable, accepts one file.
   Copy: "The file is read in this tab. Nothing is uploaded, signed or spent."
2. **Deal selector**: optional; defaults to the deal in the route, otherwise a select of known deals
   with roots, each labelled.
3. **Progress**: block count and bytes hashed, cancellable, no layout shift.
4. **Result**: expected root, computed root, size, block count, verdict `MATCH` or `MISMATCH` with a
   plain sentence. `MISMATCH` says "this file is not the file committed by this deal"; it never says
   the deal is fraudulent.
5. **Sample**: a button "use the 8 KiB sample" loads `/samples/demo-8k.bin` for a judge with no file.

Refusals: empty file, file over 16 MiB, no root, unreadable file — plain reason, no verdict.
The screen never calls the RPC and never constructs a client.

## Screen: Proof

Three sections, each with its own table and caption:

1. **Deployments**: address, tx, block, runtime bytes, creation bytes, compiler, code hash, method.
2. **Transactions**: label, hash (copy), block, status, receipt state, finality method, five stages,
   evidence file, live cross-check control when the mode is live.
3. **Refusals**: attempted call, expected error, verbatim reason, evidence source, note. A refusal is
   styled as a rule, not as a red failure.

Live cross-check results use the receipt classification from `data-model.md`. The tables are
sortable by block; the default is chronological. Filters: "all", "recorded", "cross-checked".

## Screen: For Judges

Five numbered steps, each a row with command, expected output and evidence path:

1. `forge build --sizes` + `node scripts/check-size.mjs` → 6,566 B ≤ 10,240 B.
2. `cd apps/makhzan && npm test` → the TypeScript suite passes.
3. `node apps/makhzan/scripts/e2e-local.mjs` → local pass and slash; ends with the PASS line.
4. `node packages/merkle-vectors/generate.ts --check` and the app's parity test → root parity.
5. `cd apps/status-ui && npm test` + the read-only guard → no write path, no wallet.

Then: **How to get gas** (honest): the v1 app needs none; a wallet that wants to transact on the
Portaldot testnet obtains tPOT through the hackathon's Discord support ticket with a native SS58
address starting with `5`, not an EVM address. No faucet URL is promised because none was confirmed.
Then: **What is not claimed** (six bullets from `docs/EXPLAIN.md`) and **What the labels mean**.

## Screen: Replay

- A horizontal block axis from the first round to the last settlement, with markers at challenge,
  answer, resolve, settle.
- Play / pause / step / scrub; keyboard arrows step one block.
- Two lanes: deal 1 (passed) and deal 2 (slashed). The bond strip animates only at the resolve block.
- Every value is `REPORTED`; the header says "recorded replay of a local anvil run — not a live run".
- No autoplay under `prefers-reduced-motion`; pause on `document.hidden`.

## Components (contract)

| Component | Responsibility | Required test |
| --- | --- | --- |
| `Metric` | one number + unit + label + source + stale/unavailable | unlabelled number fails; stale badge after 30 s |
| `StageTracer` | five evidence stages, observed/not observed | all five labelled; no inference |
| `RoundLabel` | five round states | each state renders its exact word |
| `AccrualCounter` | anchor + ticks + cap + settle | cap, stop at end, reconcile, reduced motion |
| `CopyHash` | copy + fallback | clipboard success and failure |
| `HealthChip` | 0–3 + unavailable | all five cases |
| `ModeBanner` | mode, chain, evidence, blocking notices | all modes and both blocking cases |
| `EvidenceNotice` | missing/bad/unverified evidence | no blank page |
| `SignalBadge` | `STALE`, `unavailable (…)`, `not recorded` | three distinct texts and neutral styling |
| `LabelLegend` | four labels + two vocabularies | present on every route |

## Non-negotiable behaviours

- `RECORDED` creates no viem client and issues no JSON-RPC request.
- No request body ever contains file bytes; the verifier has no fetch/upload call.
- No `sendTransaction`, `writeContract`, wallet client, key loader or `window.ethereum` reference.
- A chain mismatch blocks live reads and keeps the recorded page.
- A failed read never blanks a route; the banner, legend and evidence values stay.
- Every number has a label and a source; every absence has a reason.
- The page works at 360 px, 200 % zoom and with reduced motion.
- No third-party runtime request; fonts and evidence are same-origin.

## Accessibility acceptance

- Skip link to `#main`; one `h1` per route; landmark roles.
- Focus visible on every interactive element (2 px ochre outline, 2 px offset).
- Drop zone is a labelled button-like control; drag-and-drop is an enhancement, not the only path.
- Copy buttons announce "copied" in an `aria-live` region and keep the hash selectable.
- Tables have `<caption>` and `<th scope>`; the stage tracer has a text equivalent (`aria-label`).
- Colour is never the only signal: labels, words and patterns accompany every state.
- Contrast ≥ 4.5:1 for text, 3:1 for large text and UI edges.
- Motion: 160–240 ms, disabled under `prefers-reduced-motion`; no flashing.

## Performance acceptance

- Initial route JS < 300 KB gzip; the sample file and evidence are lazy-loaded only on demand.
- The verifier yields every 256 blocks, never blocks longer than 50 ms per slice.
- No layout shift when the live overlay replaces a reported value (reserved numeric width, tabular
  numerals).

## Forbidden symbols and methods (guard input)

`sendTransaction`, `writeContract`, `writeContracts`, `createWalletClient`, `walletClient`,
`privateKeyToAccount`, `mnemonicToAccount`, `hdKeyToAccount`, `window.ethereum`, `eth_sendTransaction`,
`eth_requestAccounts`, `eth_sign`, `personal_sign`, `eth_signTypedData`, `wagmi`, `@wagmi/`,
`@rainbow-me/`, `ethers`, `web3`, `@solana/`.

Allowed viem imports: `createPublicClient`, `http`, `defineChain`, `keccak256`, `concatBytes`,
`hexToBytes`, `bytesToHex`, `formatUnits`, `parseAbi`/typed ABI objects.
