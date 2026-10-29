# Feature Specification: Mobile Navigation & Accessibility Pass

**Feature Branch**: `010-ui-mobile`

**Created**: 2026-10-29

**Status**: In Progress

**Input**: User description:
1. The nav is desktop-only. Add a mobile menu (hamburger or bottom bar) with every route: /, /deal, /verify, /proof, /judges, /replay, /gate, receipts. 44 px touch targets, keyboard and screen-reader friendly, 0 px overflow at 390 px, and tests.
2. Accessibility pass on every page: visible focus rings, text contrast of at least 4.5:1, labels on every button and input, no color-only meaning (MEASURED / REPORTED / DESIGN NOTE labels stay text).
3. Add a "Start here for judges" strip at the top of the Overview: three buttons (Verify a file, Watch the slash replay, See the gate), each one line of plain text. Text only, no new claims.

## User Scenarios & Testing

### User Story 1 - Mobile Navigation (Priority: P1)
A judge or visitor accessing the status UI on a mobile device (390 px width or smaller) can open an accessible mobile menu containing all routes (/, /deal, /verify, /proof, /judges, /replay, /gate, receipts) with at least 44 px touch targets, keyboard support (Escape to close), screen-reader semantics (aria-expanded, aria-controls, nav landmark), and 0 px horizontal overflow.

### User Story 2 - Accessibility Pass (Priority: P2)
A keyboard user or low-vision user navigating any page in the application encounters high-contrast text (>= 4.5:1 contrast against dark background), visible focus rings on interactive elements, descriptive labels on every button and input, and explicit textual meaning on all badges (no color-only semantics).

### User Story 3 - Start Here For Judges Strip (Priority: P3)
A judge landing on the Overview sees a prominent "Start here for judges" action strip with three direct buttons/links ("Verify a file", "Watch the slash replay", "See the gate"), allowing immediate exploration without guessing which page demonstrates the core verifiable flows.

## Requirements

- **FR-001**: Mobile navigation menu accessible on screens `< md` containing links to `/`, `/deal/1`, `/verify`, `/proof`, `/judges`, `/replay`, `/gate`, `/receipt/1`, `/receipt/2`. Touch targets >= 44 px height.
- **FR-002**: Mobile menu supports toggle button with `aria-expanded`, `aria-label`, Escape key handling, and closes on route change.
- **FR-003**: 0 px horizontal page overflow at 390 px viewport.
- **FR-004**: Text contrast across all text elements meets or exceeds WCAG 2.1 AA 4.5:1. Muted text (`--ash-2`) is tuned to >= 4.5:1.
- **FR-005**: All buttons and inputs carry accessible names (`aria-label`, visible text, or associated `<label>`).
- **FR-006**: Status badges maintain text-first presentation (`MEASURED`, `REPORTED`, `DESIGN NOTE`, `PENDING LIVE RUN`).
- **FR-007**: Overview page features a "Start here for judges" strip with plain-text links to Verify, Replay, and Gate.
