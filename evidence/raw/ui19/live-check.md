# 033-ui-all-deals — Live Production Verification (UI19)
Timestamp (UTC): 2026-11-04T10:59:55.186Z
Deployment: https://status-ui-one.vercel.app (Production)
Browser: headless Chromium via playwright-core

## Favicon & Apple Touch Icon Verification

- `/favicon.ico`: HTTP 200 OK
- `/apple-touch-icon.png`: HTTP 200 OK

## Live Chain Data Assertions

- **Overview ( `/ `):**
  - Shows **6 created / 5 settled / 1 healthy now**: PASS
  - Deal chips for deals 1..6 rendered and linked: PASS
- **Deal 6 Detail ( `/deal/6 `):**
  - Shows health **healthy** / status **healthy**: PASS
  - Shows end block **418,835**: PASS

## Responsive, Typography & Contrast Audit

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
- Favicon & Icon HTTP Status: 200 OK
- Overview & Deal 6 Live Verification: PASS
- Overall Production Verdict: **PASS**
