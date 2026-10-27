# DEMO CHECKLIST — Makhzan

Local demo is the default. Nothing on this list claims a live run; the live run itself is already
recorded (`evidence/raw/t1/72-live-summary.txt`), so do not re-run it on stage.

## Ten minutes before

- [ ] `cd contracts && forge build --sizes` → Makhzan runtime 6,566 B (budget 10,240 B).
- [ ] `node scripts/check-size.mjs` → PASS.
- [ ] `cd apps/makhzan && npm test` → 0 failed (117 tests at batch 10b).
- [ ] `cd apps/gates && npm test` → 0 failed (49 tests).
- [ ] Free ports 8549 (anvil), 8564 (e2e), 8588 (daemon).
- [ ] Fresh shell without stray `MAKHZAN_*` variables; never echo a key.
- [ ] Screen recording on, terminal font readable, no `.env` in the frame.

## What could go wrong

| Failure | First response |
| --- | --- |
| anvil port busy | `ss -ltnp \| grep 8564`; kill the stale anvil, rerun |
| deploy refuses with a pending record | read the state (`sending` has no hash): check nonce/explorer, then `--resume <hash>` or `--force-new` and record why |
| deploy refuses on reserve | print balance/estimate/remainder; fund the owner or lower the plan deliberately |
| receipt timeout | keep the pending record, rerun with `--resume <hash>`; never delete the file silently |
| daemon answers nothing | check `doctor`, the daemon state file and the ChallengeOpened event; do not hand-send a second answer |
| round still pending | wait for the poll; a second send is blocked by the same-round guard |
| slash number looks off | read the bond before/after and the owner balance delta; expect exactly 20% |
| evidence file missing | `doctor` and re-run the producer; a missing file is a notice, not a pass |
| RPC dies mid-demo | switch to the recorded evidence bundle and the backup recording |
| live RPC unavailable | do not improvise a live claim; point at the recorded live run in `evidence/raw/t1/72-live-summary.txt` and show local evidence |

## Backup-video plan

1. Record a full local run: deploy, passed round, skipped round, resolve, `doctor`,
   `verify:deployment`, evidence bundle.
2. Keep the raw recording plus the terminal log in `evidence/raw/t1/` (same commands, same order).
3. If the live network or anvil fails on stage, play the recording and point at the exact evidence
   files; never claim the recording is a live run.
4. Keep a second copy on a different machine and the sync folder.
5. Re-record only after a green gate, so the video and the repository cannot disagree.

## During the demo

- [ ] Say "local only" once at the start; the live run is already recorded, so quote its file rather
      than claiming a new one.
- [ ] Show the slash math from the command output, not from a slide.
- [ ] Show `healthOf` values 1 → 2 → 3 → 0 at the window boundaries.
- [ ] Show `evidence/refusals.json` (decoded errors, eth_call only).
- [ ] Show `evidence/verify-deployment.local-anvil.json` (byte-for-byte match).

## After

- [ ] Stop anvil and the daemon; no background process is left.
- [ ] `git status --short` clean; evidence committed.
- [ ] Record the demo time, commit hash and any deviation in the checkpoint.
