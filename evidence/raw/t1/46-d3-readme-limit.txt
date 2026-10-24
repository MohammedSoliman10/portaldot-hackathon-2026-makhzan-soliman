# D3 — one honest-limits line in the README and in the T058 task text
# UTC: 2026-10-21T11:52:34Z
# Local only; no RPC, no keys.

$ sed -n "14,16p" README.md
## Known limits

- Identical blocks, and whole identical subtrees, are interchangeable in a Merkle proof by design: one stored copy answers either challenge and this does not reduce what a provider must store (FR-017, DR-011).

$ grep -n "known-limits line" specs/002-core-storage-proofs/tasks.md
191:- [ ] T058 [US3] Update `README.md` with the tier-1 implemented / simulated / roadmap table (rows match the evidence), a Mermaid architecture diagram (clien
