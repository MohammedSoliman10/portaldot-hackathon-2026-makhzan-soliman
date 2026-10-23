# Quickstart — 003-status-ui

**Feature**: Makhzan Proof and Status web app | **Stage**: pre-implementation (no app code exists yet)

This is the runbook the implementation must make true. Every command is local; nothing here deploys or
calls a live RPC.

## Prerequisites

- Node 24.20 (the version CI pins), npm 11.
- The repository worktree at `/home/mohammed_soliman/hackathons/portaldot-ui`.
- No wallet, no key, no `.env` with secrets. The app reads four public variables only.

## Install and run

```bash
cd apps/status-ui
npm ci
npm run dev            # http://localhost:5173, RECORDED by default
npm run typecheck
npm test               # unit + component + guard + node parity
npm run test:browser   # one Playwright Chromium parity spec
npm run build
npm run preview        # serves dist/ with SPA fallback
```

## Modes

```bash
# RECORDED (default): no RPC client is created
npm run dev

# LOCAL: reads the local anvil the 002 e2e leaves running (read-only)
VITE_MAKHZAN_MODE=LOCAL \
VITE_MAKHZAN_RPC_URL=http://127.0.0.1:8564 \
VITE_MAKHZAN_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3 \
npm run dev

# LIVE: a public testnet address and RPC; still read-only
cp .env.example .env.local        # fill the four public values; never commit it
npm run build
```

`VITE_MAKHZAN_CHAIN_ID` defaults to `420420777`. An address without an explicit mode resolves to
`LIVE`. `RECORDED` ignores a configured address. Changing values is a rebuild, not a runtime toggle.

## Verify a file

```bash
# deterministic sample: 8,192 bytes of 0x5a, root 0xd6bcfc4d…6325b7
head -c 8192 /dev/zero | tr '\0' 'Z' > /tmp/makhzan-demo-8k.bin
```

Open `/verify/1`, drop the file, expect `MATCH`. Drop any other byte and expect `MISMATCH`. The devtools
network panel must show no request with file bytes.

## Rebuild the evidence fixture

The fixture is a transcription of the latest local process run. Re-run the run and compare, do not
edit numbers by hand:

```bash
cd apps/makhzan
node scripts/e2e-process.mjs           # local anvil, separate processes, pass + slash + settle
```

Then copy the printed values into a new file under `apps/status-ui/public/evidence/`, add it to
`index.json`, compute its SHA-256, and run `npm test`. Never edit an existing evidence file; a new run
is a new version.

## Recompute the sample root without the app

```bash
cd /home/mohammed_soliman/hackathons/portaldot-ui
node --experimental-strip-types -e '
import { buildTree } from "./apps/makhzan/src/merkle.ts";
const b = Buffer.alloc(8192, 0x5a), leaves = [];
for (let i = 0; i < b.length; i += 1024) leaves.push(new Uint8Array(b.subarray(i, i + 1024)));
console.log(buildTree(leaves).root);'
```

Expected: `0xd6bcfc4d0c933f0680ec2e7b1c0ea8aecba797de45bf726ae0ca4c8c286325b7`.

## Deploy to Vercel (documented, not performed in this stage)

| Setting | Value |
| --- | --- |
| Root Directory | repository root (`.`) |
| Install Command | `npm --prefix apps/makhzan ci && npm --prefix apps/status-ui ci` |
| Build Command | `npm --prefix apps/status-ui run build` |
| Output Directory | `apps/status-ui/dist` |
| Environment | the four `VITE_MAKHZAN_*` values, public |

The Root Directory is the repo root because the app imports `apps/makhzan/src/merkle.ts`; setting it to
the app directory would break the build. `vercel.json` at the repository root carries the install
command, build command, output directory and the SPA rewrite to `/index.html`.

## Local gates before any "done" claim

```bash
cd apps/status-ui
npm run typecheck
npm test
npm run test:browser
npm run build
node ./scripts/smoke-routes.mjs        # serves dist/ and opens /, /deal/2, /verify, /proof, /judges, /replay
```

Plus the repository-wide gates for the files this feature touches: `forge build --sizes` unchanged,
`node scripts/check-size.mjs`, and `git status` free of keys and `.env`.

## Evidence refresh is a reviewed change

1. New run → new evidence file, never an edit.
2. New SHA-256 in `index.json`.
3. Fixture validates; parity and component tests pass.
4. `docs/status-ui.md` records the evidence id and UTC.
5. The checkpoint names the evidence file; nothing is labelled `LIVE` without a live run.
