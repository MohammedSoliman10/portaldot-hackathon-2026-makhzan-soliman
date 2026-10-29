# Implementation Plan: Mobile Navigation & Accessibility Pass

**Branch**: `010-ui-mobile` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

## Summary

Enhance the status UI with an accessible mobile navigation menu, perform an accessibility pass across all pages (contrast >= 4.5:1, visible focus rings, aria labels), and add a "Start here for judges" quick-navigation strip to the Overview page.

## Technical Details

- **Mobile Navigation Component**: Added to `Shell.tsx` as a mobile header with hamburger toggle (`aria-expanded`, `aria-controls="mobile-menu"`, min 44x44 px touch target), expanding into an accessible `<nav id="mobile-menu" aria-label="Mobile navigation">` with all 9 routes and receipts.
- **Route redirects**: Add `/deal` -> `/deal/1` and `/receipt` -> `/receipt/1` redirect routes in `routes.tsx` so bare paths resolve cleanly.
- **Accessibility & Contrast**:
  - Update `--ash-2` in `tokens.css` from `#6a665d` (3.2:1) to `#827d72` (> 4.5:1 against `#0b0c0b`).
  - Add explicit `aria-label` to file inputs, icon buttons, and interactive controls where needed.
  - Verify `:focus-visible` styling is consistent and unsuppressed across interactive elements.
  - Ensure badge components (`label-chip`) present full text labels without relying solely on color.
- **Start Here Strip**:
  - Added in `Overview.tsx` under header: `<nav aria-label="Start here for judges">` containing three clear action buttons/links: "Verify a file", "Watch the slash replay", "See the gate".
- **Testing**:
  - `mobile-nav.test.tsx`: test mobile toggle, touch target sizes, aria attributes, route links, keyboard escape.
  - `accessibility.test.tsx`: test contrast token values, button and input labels, focus indicators, badge text.
  - `overview-strip.test.tsx`: test the presence and links of the "Start here for judges" strip.
