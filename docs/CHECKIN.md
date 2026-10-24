# CHECKIN — Makhzan

Ready-to-paste text for the DoraHacks check-in. Live facts are labelled `[live run]`; everything else
is local (anvil) evidence. Nothing beyond the recorded evidence is claimed.

## 1. Project name

```text
Makhzan
```

## 2. One-sentence pitch

```text
Makhzan lets a client prove that a storage provider missed a block, then pays the client automatically
from the provider's on-chain bond on Portaldot — no trusted middleman.
```

## 3. Problem

```text
A storage deal is a promise about bytes the client cannot see. Today the client either trusts the
provider or pays for a full audit. Settling "did you keep block 7?" on-chain needs a compact
commitment, a bounded challenge window, a verifiable answer, and a penalty that actually pays the
wronged client.
```

## 4. Solution

```text
1) The client splits the file into 1 KiB blocks, commits a Merkle root on-chain with the deal price in
native tPOT, and keeps the bytes with the provider. 2) The provider stakes a bond. 3) The client opens
a challenge; the contract picks a leaf index and a 50-block deadline. 4) The provider answers with the
block and Merkle path; a valid answer closes the round with no bond movement. 5) A missed deadline is
resolved by anyone: exactly 20% of the bond is slashed to the owner. 6) After the end block the
provider claims its accrued price and the owner settles. Other contracts can gate on availability
through healthOf(dealId).
```

## 5. Current progress (paste)

```text
The Tier-1 contract is deployed on the Portaldot V3 testnet [live run]: address
0x60481DFcFCA34A8F095939D9675eC715127B2e44, deploy tx
0xf29a52c507726ceed20861f2cc4cc5f937542d0caa42a7e2a369ea08c998e3e7 at block 171308, chain
420420777. Measured deploy cost 529.844316817465986480 tPOT against a 538.123540 tPOT estimate
(ratio 0.9846146412530473; Tier-0 calibration 0.984608251872). verify:deployment matches the artifact
byte for byte (6,566 B runtime; code hash
0x115036eac836fca78bef7824fb0d0834ccf3d9d7f9663fe154c36e91f7d26a98) and the constructor config reads
back as window 50, block size 1024, slash 2000 bps, min bond 1e15 units, duration 100...100800.

Locally the full product is green: 152 Forge tests, 128 client/daemon tests, 45 gate tests and 3
secret-scanner tests; a local end-to-end run covers a 1 MiB file (1,024 blocks), one passed challenge,
one skipped challenge with exactly 20% slashed to the owner, claim and settle. Live registration and
the two live challenge rounds have NOT run yet and are not claimed.
```

## 6. Outstanding items (paste)

```text
- Live round: register provider-1 with a 30 tPOT bond, run one passed challenge and one slashed
  challenge, then claim and settle, recording each receipt. [pending live run]
- Status web app: feature 003 (health/deal status UI) is in progress on its own branch and not merged.
- Replication/repair and a per-deal bond are roadmap; the current bond is shared across a provider's
  deals.
- README/check-in polish: demo video or hosted live link is not yet published; the explorer has no
  confirmed transaction-hash route (the address and block search work).
- No audit, no explorer source verification, no proven randomness beyond the documented D5 fallback.
```

## 7. Public repository

```text
https://github.com/MohammedSoliman10/portaldot-hackathon-2026-makhzan-soliman
```

Default branch: `main`. The README top has the pitch, deployment table, architecture diagram, quick
start and honest status.

## 8. Portaldot testnet deployment (paste)

```text
Chain:        Portaldot V3 testnet, chain id 420420777
RPC:          https://test-evm-rpc-v3.portaldot.dev
Contract:     0x60481DFcFCA34A8F095939D9675eC715127B2e44
Deploy tx:    0xf29a52c507726ceed20861f2cc4cc5f937542d0caa42a7e2a369ea08c998e3e7
Block:        171308
Status:       success [live run]
Measured:     529.844316817465986480 tPOT (estimate 538.123540; ratio 0.9846146412530473)
Code:         6,566 B runtime, verify:deployment match, code hash 0x1150...6a98
Config:       window 50, block size 1024, slash 2000 bps, min bond 1e15 units, duration 100...100800
Explorer:     https://pindex.onrender.com/app/?q=0x60481DFcFCA34A8F095939D9675eC715127B2e44
              (address lookup works; search block 171308 for the deploy; no confirmed tx-hash route)
Evidence:    evidence/raw/t1/59-live-deploy.txt,
              evidence/deployments/live-420420777-20261024-065714Z.json,
              evidence/verify-deployment.json
```

## 9. Demo

```text
<PASTE DEMO VIDEO OR HOSTED LIVE LINK HERE>
```

Placeholder only. The recorded script is [demo.md](demo.md) and the failure/backup plan is
[DEMO-CHECKLIST.md](DEMO-CHECKLIST.md). No video or hosted demo link is published yet.

## 10. Portaldot relevance

```text
Makhzan settles storage disputes in Portaldot's native tPOT, uses the chain's EVM/pallet-revive path
for ordinary Solidity, respects the 10,000 wei unit factor, and keeps a 6,566 B runtime that fits the
size budget. The evidence layer separates measured live facts from local results, which matters on a
new chain with uneven RPC behaviour.
```

## 11. What works now (local, evidenced)

- Merkle block commitment shared by Solidity and TypeScript (golden vectors; leaf counts 1, 3, 7, 1000).
- Provider registration and bond; deal creation with exact native-unit accounting.
- Challenge → answer → resolve, including a pass with no bond movement and exactly 20% slash on a miss.
- Claim (provider-only) and settle, exactly-once accounting.
- `healthOf` availability view with every boundary tested.
- CLI, daemon, deploy with pending record/resume, evidence bundle, verify:deployment, refusals, doctor.
- 152 Forge + 128 + 45 + 3 TypeScript tests; gate and process-level e2e green (see `evidence/raw/t1/`).

## 12. What is not claimed

- Live registration, live rounds, live block time and live retrieval behaviour: `[pending live run]`.
- No explorer source verification (records say `sourceVerified: false`); only byte-for-byte code match.
- No audit, no per-deal bond, no replication proof, no pull-payment escrow.
- A pass proves one block at one moment, not continuous storage.
- The challenge index is the documented D5 fallback, not a proven randomness beacon.
- Identical blocks are interchangeable by design (the leaf commits bytes, not position).

## 13. Demo flow (3 minutes)

1. `forge test` summary and `node scripts/check-size.mjs` (6,566 B ≤ 10,240 B).
2. Start anvil, deploy, register provider-1, upload a 1 MiB file, create deal A.
3. Challenge A; the daemon answers; show the passed round and unchanged bond; after the end block
   claim with provider-1, then settle with the owner.
4. Create deal B with the daemon in skip mode; challenge, wait the 50-block window, resolve; show
   exactly 20% slashed and the owner credited; claim with provider-1, then settle.
5. `doctor` and `verify:deployment` output; open the evidence bundle and the refusals file.

## 14. Next proof milestone

A live registration, one passed and one slashed live round, then claim and settle — replacing every
`[pending live run]` row with a measured receipt hash.
