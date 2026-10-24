# status-ui — Makhzan Proof and Status

A static, read-only page that shows what a Makhzan deployment committed, what it executed, and what a
judge can verify without a wallet, an account or a key. Evidence first: every route renders from one
versioned JSON bundle. When an address is configured, read-only view calls annotate the page — the app
has no code path that signs, sends or spends.

**Live page:** https://status-ui-one.vercel.app — the Overview reads the deployment live and falls
back to the recorded evidence.

**Status:** local, recorded evidence only. No live deployment is claimed by this app, and no number on
it is `MEASURED` unless the browser read it in this session.

## Commands

Run from `apps/status-ui` (Node 24):

```bash
npm ci
npm run dev          # http://localhost:5174
npm run typecheck
npm test             # jsdom unit + component tests
npm run build        # typecheck, then vite build into dist/
npm run check:evidence
npm run check:sample
npm run check:readonly
npm run smoke        # serves dist/ and opens all six routes directly
```

`npm run test:browser` is the Vitest browser-mode parity job; its harness is deferred (T004) and the
Node parity test is the active gate until it lands.

## Configuration

Four public build-time variables; nothing else is read. None is a secret.

| Variable | Meaning | Default |
| --- | --- | --- |
| `VITE_MAKHZAN_MODE` | `RECORDED`, `LOCAL` or `LIVE` | unset |
| `VITE_MAKHZAN_RPC_URL` | HTTP JSON-RPC endpoint, required by `LOCAL`/`LIVE` | unset |
| `VITE_MAKHZAN_CHAIN_ID` | expected chain id | `420420777` |
| `VITE_MAKHZAN_CONTRACT_ADDRESS` | deployment to read | unset |

`.env.example` lists the names with empty values. Vite inlines them at build time, so changing the mode
is a redeploy, not a runtime switch.

## Mode matrix

| `VITE_MAKHZAN_MODE` | address | result |
| --- | --- | --- |
| unset | absent or invalid | `RECORDED` |
| unset | valid | `LIVE` |
| `RECORDED` | any | `RECORDED`, no client is created |
| `LOCAL` / `LIVE` | valid | that mode |
| `LOCAL` / `LIVE` | absent or invalid | blocking `CONFIG` notice, recorded data stays visible |

`LOCAL` is never inferred. A chain id that differs from the expected one blocks live reads and keeps the
recorded page. The banner is never dismissible.

## Vercel settings

- Root Directory: `.` (the repository root — the app imports `apps/makhzan/src/merkle.ts`)
- Install: `npm --prefix apps/makhzan ci && npm --prefix apps/status-ui ci`
- Build: `npm --prefix apps/status-ui run build`
- Output: `apps/status-ui/dist`
- Rewrites: `/(.*) → /index.html` (`vercel.json` at the repository root)

## Evidence

`public/evidence/index.json` names the current bundle and its SHA-256. The loader verifies the hash over
the fetched bytes and marks a mismatch as unverified instead of hiding the page. Refreshing evidence
means adding an immutable file and updating `current`; old files are never edited. The schema is
published at `docs/evidence-schema.md`.

## Labels and limits

Every number carries one of `MEASURED`, `REPORTED`, `SIMULATED` or `PENDING LIVE RUN`, plus a source.
Rounds use `pending / submitted / passed / failed / unanswered`; transactions use
`submitted / included / executed / finalized / read back`. A missing receipt is neutral, never a
failure. The page proves one block was retrievable at one moment — not continuous storage, distinct
copies, unpredictable challenges, explorer source verification or live economics. Those limits are
listed on the Judges page and in `docs/EXPLAIN.md`.

## Third-party software

| Package | Licence | Role |
| --- | --- | --- |
| `react`, `react-dom` | MIT | UI |
| `react-router-dom` | MIT | client routes |
| `viem` | MIT | read-only JSON-RPC client |
| `tailwindcss`, `@tailwindcss/vite` | MIT | styles |
| `@fontsource-variable/space-grotesk` | OFL-1.1 | prose typeface, bundled |
| `@fontsource/ibm-plex-mono` | OFL-1.1 | data typeface, bundled |
| `vite`, `vitest`, `@vitejs/plugin-react`, `typescript` | MIT / Apache-2.0 | build and tests |
| `jsdom`, `@testing-library/*` | MIT | test environment |

No wallet, charting, analytics, icon or state-management package is installed. The app makes no
third-party request at runtime: fonts and evidence are same-origin.

## AI assistance

The specification, tests, components and documentation in this feature were written with AI assistance
and reviewed by the repository owner. Commits carrying AI-written code are marked `[ai]`. Numbers in
this README are dated commands, not claims: the fixture is a local anvil run on 2026-10-23.
