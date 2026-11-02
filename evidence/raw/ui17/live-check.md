# 026-ui-dark-gold — Live Production Verification (UI17)
Timestamp (UTC): 2026-11-02T15:30:46.125Z
Deployment: https://status-ui-one.vercel.app (Production)
Browser: headless Chromium (chrome-headless-shell 1248) via playwright-core

## Favicon & Apple Touch Icon Verification

- `/favicon.ico`: HTTP 200 OK
- `/apple-touch-icon.png`: HTTP 200 OK

## Audit Criteria

1. **Horizontal Overflow**: `scrollWidth` must equal viewport width (`overflow == 0px`).
2. **Typography**: No non-badge text under 14px (all descriptive and data text >= 14px; `.label-chip` badges allowed at 13px).
3. **Contrast**: WCAG 2.1 contrast ratio >= 4.5:1 for normal text and >= 3:1 for large text against composited background.
4. **Light Surfaces**: No large (>4000px²) light surfaces with luminance > 0.5 that are not gold fills.

## Results Table

27 route × width combinations: **0 contrast failures**, **0 non-badge text nodes under 14px**, **438 label chips at 13px** (allowed), **0 light surfaces that are not gold**, **0px overflow** (scrollWidth equals viewport width everywhere).

| Viewport | Route | scrollWidth | Viewport Width | Overflow | Contrast Failures | Text <14px (non-badge) | Non-Gold Light Surfaces | Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1440px | / | 1440px | 1440px | 0px | 0 | 0 | 0 | PASS |
| 1440px | /deal/2 | 1440px | 1440px | 0px | 0 | 0 | 0 | PASS |
| 1440px | /verify | 1440px | 1440px | 0px | 0 | 0 | 0 | PASS |
| 1440px | /proof | 1440px | 1440px | 0px | 0 | 0 | 0 | PASS |
| 1440px | /gate | 1440px | 1440px | 0px | 0 | 0 | 0 | PASS |
| 1440px | /judges | 1440px | 1440px | 0px | 0 | 0 | 0 | PASS |
| 1440px | /replay | 1440px | 1440px | 0px | 0 | 0 | 0 | PASS |
| 1440px | /receipt/1 | 1440px | 1440px | 0px | 0 | 0 | 0 | PASS |
| 1440px | /receipt/2 | 1440px | 1440px | 0px | 0 | 0 | 0 | PASS |
| 1024px | / | 1024px | 1024px | 0px | 0 | 0 | 0 | PASS |
| 1024px | /deal/2 | 1024px | 1024px | 0px | 0 | 0 | 0 | PASS |
| 1024px | /verify | 1024px | 1024px | 0px | 0 | 0 | 0 | PASS |
| 1024px | /proof | 1024px | 1024px | 0px | 0 | 0 | 0 | PASS |
| 1024px | /gate | 1024px | 1024px | 0px | 0 | 0 | 0 | PASS |
| 1024px | /judges | 1024px | 1024px | 0px | 0 | 0 | 0 | PASS |
| 1024px | /replay | 1024px | 1024px | 0px | 0 | 0 | 0 | PASS |
| 1024px | /receipt/1 | 1024px | 1024px | 0px | 0 | 0 | 0 | PASS |
| 1024px | /receipt/2 | 1024px | 1024px | 0px | 0 | 0 | 0 | PASS |
| 390px | / | 390px | 390px | 0px | 0 | 0 | 0 | PASS |
| 390px | /deal/2 | 390px | 390px | 0px | 0 | 0 | 0 | PASS |
| 390px | /verify | 390px | 390px | 0px | 0 | 0 | 0 | PASS |
| 390px | /proof | 390px | 390px | 0px | 0 | 0 | 0 | PASS |
| 390px | /gate | 390px | 390px | 0px | 0 | 0 | 0 | PASS |
| 390px | /judges | 390px | 390px | 0px | 0 | 0 | 0 | PASS |
| 390px | /replay | 390px | 390px | 0px | 0 | 0 | 0 | PASS |
| 390px | /receipt/1 | 390px | 390px | 0px | 0 | 0 | 0 | PASS |
| 390px | /receipt/2 | 390px | 390px | 0px | 0 | 0 | 0 | PASS |

## Summary

- Routes Checked: 27
- Contrast Failures: 0
- Non-Badge Text <14px: 0
- Label Chips (13px): 438
- Favicon 200 OK: true
- Apple Touch Icon 200 OK: true
- Overall Verdict: **PASS**
