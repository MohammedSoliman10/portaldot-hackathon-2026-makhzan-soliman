# Tier-1 Evidence Schema

**Feature**: `002-core-storage-proofs` | **Constitution**: Principle V

Reuse the tier-0 evidence writer (`apps/gates/src/lib/evidence.ts`) through
`apps/makhzan/src/evidenceWriter.ts`: the same secret sanitiser, the same atomic temp-file-then-rename
write. Raw command output goes to `evidence/raw/t1/<name>.txt`; structured round records go to
`evidence/tier1-results.md` and to per-round JSON under `evidence/raw/t1/`.

## Transaction record

```json
{
  "label": "resolve",
  "dealId": 1,
  "status": {
    "submitted": { "hash": "0x..", "nonce": 12, "at": "2026-10-21T00:00:00Z" },
    "included":  { "block": 123456, "blockHash": "0x.." },
    "executed":  { "receiptStatus": "success", "gasUsed": "0" },
    "finalized": { "method": "tag:finalized" | "heuristic(confirmations=12)", "block": 123460 },
    "readBack":  [ { "call": "dealOf(1)", "result": { "flags": 1, "claimed": "0" } } ]
  },
  "error": null
}
```

Rules:
- `finalized.method` MUST name how it was observed. A confirmation heuristic MUST carry its depth and
  MUST NOT be presented as protocol finality.
- `readBack` MUST contain at least one call whose result changed or that proves the effect.
- A record with `executed.receiptStatus == "reverted"` keeps the raw revert reason verbatim and gets
  no `readBack` values that assume success.
- The record contains no key, no signed payload and no environment value; the writer's `assertNoSecrets`
  runs before the file is written.

## Round record (the two acceptance rounds)

```json
{
  "round": "passed" | "slashed",
  "deal":   { "id": 1, "owner": "0x..", "providerId": 1, "root": "0x..", "size": 1048576,
              "leafCount": 1024, "startBlock": 100, "endBlock": 700, "price": "..." },
  "challenge": { "index": 7, "startBlock": 120, "deadline": 170, "expectedPathLength": 10 },
  "transactions": [ /* one record per submitted transaction, in order */ ],
  "before": { "bond": "...", "ownerBalance": "...", "contractBalance": "..." },
  "after":  { "bond": "...", "ownerBalance": "...", "contractBalance": "...", "claimed": "..." },
  "delta":  { "bond": "...", "owner": "...", "slash": "..." },
  "notes": "free text, e.g. drill mode used to force a failed answer"
}
```

For the slashed round, `delta.slash` MUST equal 20% of `before.bond` (or the clamped bond), and
`delta.owner` MUST equal `delta.slash` net of gas.

## Budget record

One table, regenerated from measurements, not hand-edited:

| Operation | Deployed bytes | Slots | tPOT (deposit) | tPOT (gas) | Confirmed by |
| --- | --- | --- | --- | --- | --- |
| deploy | runtime size at build | 2 fixed config slots | code deposit + contract charge + 2 slot deposits | deploy gas × price | G05 |
| register provider | 0 | 2 | 2 × slot deposit | receipt gas × price | G05 |
| create deal | 0 | 3 | 3 × slot deposit | receipt gas × price | G05 |
| challenge / answer / resolve / claim / settle | 0 | 0 new | 0 | receipt gas × price | G05 |

Before G05 has a verdict, every `tPOT` cell is prefixed **estimate** and the table says so in its
caption. After G05, the prefix is removed only for the rows the gate actually measured.

## Local vs live labelling

Every record carries `"environment": "anvil-local" | "portaldot-v3"` and, for live records, the RPC
URL and the UTC timestamps. A local record never appears in a row that claims live evidence, and a
blocked live item is rendered as `BLOCKED — <reason>` rather than omitted.
