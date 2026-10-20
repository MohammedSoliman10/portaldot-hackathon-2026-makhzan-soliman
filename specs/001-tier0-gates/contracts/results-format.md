# Interface Contract: Results and Decision Documents

**Feature**: `001-tier0-gates` | **Version**: 1.0 (2026-10-20)

Two human-readable documents are the deliverable. Both are checkable against the JSON records, and
neither may contain a claim that no record supports.

## 1. `evidence/tier0-results.md`

Structure is fixed by `contracts/evidence-schema.md` §3. Content rules:

### Gate table columns

| Column | Rule |
| --- | --- |
| Gate | `G10` … `G09`, in brief order |
| Question | the gate's question, one line |
| Run state | `done`, `blocked` or `not_run`, exactly as in the record |
| Verdict | PASS / PARTIAL / FAIL for `done`; `—` for blocked and not-run rows |
| Classification | `FALLBACK-TRIGGER`, `DESIGN-CHANGE`, or `—` for PASS and non-`done` rows |
| Evidence | relative link to `gates/<id>.json` plus the most important raw artifact; for a missing record, `NOT RUN — halted at <gate>` or `BLOCKED — <reason>` |

### Verdict prose

For each gate, a short block containing:
- the exact commands (env var names only);
- the key numbers with units and the measurement method;
- tx hashes or the verbatim error;
- one sentence stating why the verdict is not the adjacent one (why PASS not PARTIAL, etc.);
- for blocked and not-run gates, the reason and the point in the sequence where it stopped, with no
  verdict claimed.

No adjectives that are not backed by a number. "Affordable", "fast" and "cheap" are replaced by the
measured value and the comparison it is judged against.

### Required sections

1. **What this makes possible** — concrete capabilities the product may rely on, each tied to a gate.
2. **What this makes impossible** — anything the evidence rules out. Write "nothing" explicitly if
   empty; do not delete the heading.
3. **What changes in the design** — one line per design change, each pointing to a decision entry.
4. **Starting facts** — all eight supplied facts with claimed vs observed value and status.
5. **Open questions** — anything the window could not answer, with the reason.

## 2. `docs/decisions.md`

Append-only log of assumption findings.

### Entry format

```markdown
## D-004 — Native balance is visible in the EVM view after mapping

- Date: 2026-10-20
- Assumption: a funded SS58 account can spend its balance through the EVM address.
- Finding: <observed, with numbers>
- Evidence: `evidence/gates/g07.json`, `evidence/raw/g07/03-transfer.txt`
- Consequence: <design change, or "none">
- Status: confirmed
```

### Rules

- IDs are sequential and never reused, even if an entry is later contradicted.
- `Evidence` must resolve to a committed file.
- `Status: contradicted` requires a consequence and, where applicable, the fallback condition id.
- Every non-PASS gate produces at least one entry.
- The classification rules are restated once at the top of the file so a reader does not need the
  brief to interpret the entries.
- No secrets, keys, balances tied to a real identity, or `.env` values. Burner addresses may appear
  because they are public chain data.

## 3. Classification rule (restated)

`FALLBACK-TRIGGER` only for:
1. no contract deploys after two serious attempts with different toolchain paths over 48 hours;
2. no usable test funds by 2026-10-21 after asking administrators;
3. RPC unusable for several consecutive days;
4. contracts cannot reliably hold or transfer value or keep state;
5. even the smallest Merkle proof cannot be verified within transaction limits.

Everything else is `DESIGN-CHANGE` and states the adaptation. A gate that fails one requirement but
whose core assumption still holds is `PARTIAL`, not a trigger. Blocked and not-run gates carry no
classification; a gate that could not run because the RPC, the funds or an upstream gate were
unavailable is blocked, never failed.

## 4. Checkpoint bundle

After G09 (or at the first hard failure), the harness copies into the sync folder:
`CHECKPOINT.md`, `constitution.md`, `spec.md`, `plan.md`, `tasks.md`, the stored analyze report,
`tier0-results.md`, `decisions.md` and the gate records. The bundle must be writable after a G01
halt, with not-run gates rendered rather than skipped. Before copying, `npm run validate` runs over the bundle and
refuses on any secret match. The checkpoint states feature, stage, UTC time,
`git log --oneline -15`, task status, deviations, risks, test and gas summary, and the exact next
step, then stops for owner approval.
