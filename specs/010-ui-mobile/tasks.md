# Tasks: Mobile Navigation & Accessibility Pass

**Input**: Design documents from `specs/010-ui-mobile/`

## Phase 1: Mobile Navigation
- [ ] **T001**: [TEST] Write tests for mobile navigation in `apps/status-ui/test/mobile-nav.test.tsx` (toggle open/close, aria-expanded, routes list including receipts, 44 px min height, escape key).
- [ ] **T002**: [FEAT] Implement mobile navigation in `Shell.tsx` (and `MobileNav.tsx`) + route redirects in `routes.tsx`. Verify tests pass.

## Phase 2: Accessibility Pass
- [ ] **T003**: [TEST] Write accessibility tests in `apps/status-ui/test/accessibility.test.tsx` (contrast ratio of tokens, button and input labels, focus-visible classes, text badge verification).
- [ ] **T004**: [FEAT] Implement contrast fix in `tokens.css` (`--ash-2` >= 4.5:1), enhance button/input aria-labels in `Verify.tsx`, `Gate.tsx`, `CopyText.tsx`. Verify tests pass.

## Phase 3: Start Here for Judges Strip
- [ ] **T005**: [TEST] Write tests for "Start here for judges" strip in `apps/status-ui/test/overview-strip.test.tsx`.
- [ ] **T006**: [FEAT] Implement "Start here for judges" strip in `Overview.tsx`. Verify tests pass.

## Phase 4: Full Gate & Merge
- [ ] **T007**: Run full gate on `010-ui-mobile`.
- [ ] **T008**: Merge `010-ui-mobile` into `main` with fast-forward only.
- [ ] **T009**: Write `CHECKPOINT-UI6.md` to `/mnt/e/obsidian.md/SOLLY/makhzan-sync/` and output 10-line summary.
