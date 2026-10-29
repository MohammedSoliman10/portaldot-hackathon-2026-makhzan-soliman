# Tasks: 012-ui-live-gate

## Phase 1: Live Gate Configuration & Public Address (Tests First)
- [ ] **T001**: [TEST] Add failing unit tests in `apps/status-ui/test/gate-page.test.tsx` for makhzan link and live gate address parsing/display.
- [ ] **T002**: [FEAT] Set `VITE_GATE_ADDRESS` in Vercel project environment for production. Update `vite-env.d.ts`, `apps/status-ui/.env.example`, `Gate.tsx` (makhzan link), `evidence/addresses.json`, and add `evidence/deployments/gate-live-420420777-20261029.json`. Verify tests pass.

## Phase 2: Headless Browser Check against Real Chain
- [ ] **T003**: [TEST/EVIDENCE] Build `apps/status-ui` with `VITE_GATE_ADDRESS` and run headless browser verification at 1280px and 390px against the live chain. Verify gate address, makhzan link, and deal 1 & 2 NotLocked verdict banners. Save screenshots to `evidence/raw/t7/`.

## Phase 3: Full Gate, FF Merge, Vercel Deploy & Deployed Verification
- [ ] **T004**: Run the full gate suite locally (forge tests/sizes/fmt, contracts diff, npm test makhzan/status-ui, typechecks, secret scan).
- [ ] **T005**: Merge `012-ui-live-gate` to `main` with fast-forward only, push to `origin/main`.
- [ ] **T006**: Deploy to Vercel from `main` (`vercel --prod`). Re-run headless checks against `https://status-ui-one.vercel.app` (/gate, /replay, /verify, mobile nav).
- [ ] **T007**: Write `CHECKPOINT-UI7.md` to `/mnt/e/obsidian.md/SOLLY/makhzan-sync/` and print 10-line summary.
