# 026-ui-dark-gold — Contrast, Text Size, Light-Surface and Overflow Audit
Timestamp (UTC): 2026-11-01T23:05:00Z
Branch: 026-ui-dark-gold (HEAD 12c4603)
Host: local Vite preview (http://127.0.0.1:4180), built with VITE_MAKHZAN_MODE=LIVE
Browser: headless Chromium (chrome-headless-shell 1248) via playwright-core 1.56.0

## Method

Every text node under `body` is walked. Its computed `color` is composited over the nearest
opaque background found by walking ancestors (translucent layers are blended in order), and the
WCAG 2.1 contrast ratio is computed against that composite. Threshold is 4.5:1 for normal text and
3:1 for large text (>=24px, or >=18.66px bold). Font size is checked on the same nodes: anything
under 14px fails unless it is a `.label-chip` badge, which the brief allows at 13px. Any element
larger than 4000px² with a background luminance above 0.5 that is not a gold fill is reported as a
light surface. Horizontal overflow is `scrollWidth - clientWidth` on the document element.

## Result

27 route x width combinations: **0 contrast failures**, **0 non-badge text nodes under 14px**,
**399 label chips at 13px** (allowed), **0 light surfaces that are not gold**, **0 overflow**.

| Viewport | Route | Overflow | Contrast failures | Text <14px (non-badge) | Non-gold light surfaces | Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| 1440px | / | 0px | 0 | 0 | 0 | PASS |
| 1440px | /deal/2 | 0px | 0 | 0 | 0 | PASS |
| 1440px | /verify | 0px | 0 | 0 | 0 | PASS |
| 1440px | /proof | 0px | 0 | 0 | 0 | PASS |
| 1440px | /gate | 0px | 0 | 0 | 0 | PASS |
| 1440px | /judges | 0px | 0 | 0 | 0 | PASS |
| 1440px | /replay | 0px | 0 | 0 | 0 | PASS |
| 1440px | /receipt/1 | 0px | 0 | 0 | 0 | PASS |
| 1440px | /receipt/2 | 0px | 0 | 0 | 0 | PASS |
| 1024px | / | 0px | 0 | 0 | 0 | PASS |
| 1024px | /deal/2 | 0px | 0 | 0 | 0 | PASS |
| 1024px | /verify | 0px | 0 | 0 | 0 | PASS |
| 1024px | /proof | 0px | 0 | 0 | 0 | PASS |
| 1024px | /gate | 0px | 0 | 0 | 0 | PASS |
| 1024px | /judges | 0px | 0 | 0 | 0 | PASS |
| 1024px | /replay | 0px | 0 | 0 | 0 | PASS |
| 1024px | /receipt/1 | 0px | 0 | 0 | 0 | PASS |
| 1024px | /receipt/2 | 0px | 0 | 0 | 0 | PASS |
| 390px | / | 0px | 0 | 0 | 0 | PASS |
| 390px | /deal/2 | 0px | 0 | 0 | 0 | PASS |
| 390px | /verify | 0px | 0 | 0 | 0 | PASS |
| 390px | /proof | 0px | 0 | 0 | 0 | PASS |
| 390px | /gate | 0px | 0 | 0 | 0 | PASS |
| 390px | /judges | 0px | 0 | 0 | 0 | PASS |
| 390px | /replay | 0px | 0 | 0 | 0 | PASS |
| 390px | /receipt/1 | 0px | 0 | 0 | 0 | PASS |
| 390px | /receipt/2 | 0px | 0 | 0 | 0 | PASS |

## Notes and limits

- The local preview logs CORS errors against the live RPC
  (`Access to fetch at 'https://test-evm-rpc-v3.portaldot.dev/' ... blocked by CORS policy`).
  That is a localhost-only artifact of the preview origin, not a change made here; the recorded
  mode and the recorded bundle still render. The same pages are checked again on the Vercel
  preview URL after deploy.
- Gold fills (mode banner, active nav pill, primary buttons, highlight pill) are bright by design;
  they are excluded from the light-surface count only when their RGB is gold-ish, and every one of
  them carries `text-on-gold`, which the audit measures at >=4.5:1.
- Full-page 1440px screenshots of all nine routes are in
  `/mnt/e/obsidian.md/SOLLY/makhzan-sync/screens-dark/`.
- Raw per-route log: `evidence/raw/ui16/contrast-audit.txt`.
