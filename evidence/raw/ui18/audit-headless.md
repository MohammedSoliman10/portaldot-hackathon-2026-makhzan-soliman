# 033-ui-all-deals — Headless Chromium Audit (UI18)
Timestamp (UTC): 2026-11-04T09:40:00Z
Deployment: Vercel Preview (https://status-jufcj0a3i-soliman11.vercel.app) & Local Preview (http://localhost:4180)
Browser: headless Chromium (chrome-headless-shell 1248) via playwright-core

## Audit Criteria

1. **Horizontal Overflow**: `scrollWidth` must equal client viewport width (`overflow == 0px`).
2. **Typography**: No non-badge text under 14px (all descriptive and data text >= 14px; `.label-chip` badges allowed at 13px).
3. **Contrast**: WCAG 2.1 contrast ratio >= 4.5:1 for normal text and >= 3:1 for large text against composited background.

## Results Table

33 route × width combinations: **0 contrast failures**, **0 non-badge text nodes under 14px**, **0px overflow** (scrollWidth equals viewport width everywhere).

| Viewport | Route | scrollWidth | Viewport Width | Overflow | Contrast Failures | Text <14px (non-badge) | Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1440px | / | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /deal/1 | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /deal/2 | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /deal/6 | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /verify | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /proof | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /gate | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /judges | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /replay | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /receipt/1 | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1440px | /receipt/2 | 1440px | 1440px | 0px | 0 | 0 | PASS |
| 1024px | / | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /deal/1 | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /deal/2 | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /deal/6 | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /verify | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /proof | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /gate | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /judges | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /replay | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /receipt/1 | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 1024px | /receipt/2 | 1024px | 1024px | 0px | 0 | 0 | PASS |
| 390px | / | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /deal/1 | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /deal/2 | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /deal/6 | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /verify | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /proof | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /gate | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /judges | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /replay | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /receipt/1 | 390px | 390px | 0px | 0 | 0 | PASS |
| 390px | /receipt/2 | 390px | 390px | 0px | 0 | 0 | PASS |

## Summary

- Route × Viewport Checks: 33
- Horizontal Overflow: 0px everywhere
- Contrast Failures: 0
- Non-Badge Text <14px: 0
- Overall Verdict: **PASS**
