# Interface Contract: Gate CLI

**Feature**: `001-tier0-gates` | **Version**: 1.0 (2026-10-20)

The harness is a headless command line. Every gate is one command that writes one JSON record and
one raw log directory, exits non-zero when the gate did not complete, and never prints a secret. A
record always carries a run state (`done`, `blocked`, `not_run`); only `done` records carry a verdict.

## Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `PORTALDOT_EVM_RPC_URL` | yes | EVM HTTP endpoint |
| `PORTALDOT_WS_URL` | yes | Substrate WS endpoint |
| `PORTALDOT_EXPLORER_URL` | optional | used only to fill `explorerUrl`; omitted when empty |
| `PROVIDER_1_KEY` … `PROVIDER_4_KEY` | G7 onward | burner keys for the four providers |
| `VAULT_AGENT_KEY` | G7 onward | burner key for the vault/agent account |
| `OWNER_KEY` | G7 onward | burner key for the owner account |

Rules:
- Keys are generated locally by `npm run keygen` into a gitignored `.env` with mode 600, which prints
  only public addresses and refuses to overwrite an existing file. Keys are read from the environment
  (or that `.env`) and used only for in-process signing.
- No command takes a key as an argument. `--private-key`, `--mnemonic` and `--seed` are rejected by
  a guard in `config.ts` before anything runs.
- Values are never printed, including in `--verbose` mode.

## Commands

| Command | Gate | Writes |
| --- | --- | --- |
| `npm run keygen` | G07 prep | `.env` (mode 600, gitignored); prints public addresses only |
| `npm run probe` | G10 | `evidence/rpc-log/<date>.jsonl`, continuously |
| `npm run gate -- G07` | G7 | `evidence/gates/g07.json`, `evidence/raw/g07/` |
| `npm run gate -- G01` | G1 | `evidence/gates/g01.json`, `evidence/raw/g01/` |
| `npm run gate -- G02` | G2 | `evidence/gates/g02.json`, `evidence/raw/g02/` |
| `npm run gate -- G03` | G3 | `evidence/gates/g03.json`, `evidence/raw/g03/` |
| `npm run gate -- G04` | G4 | `evidence/gates/g04.json`, `evidence/raw/g04/` |
| `npm run gate -- G05` | G5 | `evidence/gates/g05.json`, `evidence/raw/g05/` |
| `npm run gate -- G06` | G6 | `evidence/gates/g06.json`, `evidence/raw/g06/` |
| `npm run gate -- G08` | G8 | `evidence/gates/g08.json`, `evidence/raw/g08/` |
| `npm run gate -- G09` | G9 | `evidence/gates/g09.json`, `evidence/raw/g09/` |
| `npm run rollup` | all | `evidence/tier0-results.md`; renders missing records as NOT RUN / BLOCKED, refuses only on malformed records |
| `npm run validate` | all | schema + secret check over `evidence/`; no writes on success |

Ordering: `G10` starts first and keeps running. The owner account is funded first, so `G01` and
`G02` run on it while the other five are funded in parallel; those five are only required from `G06`
and `G08`. The gate order is fixed: G07 → G01 → G02 → G03 → G04 → G05 → G06 → G08 → G09. `G01`
halts the sequence on a hard failure, and later gates are recorded as `not_run`.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | gate `done`: verdict (PASS, PARTIAL or FAIL) written and every artifact saved |
| 2 | gate `blocked`: RPC, funds or an upstream gate prevented the run; record written with `runState: blocked` and a reason, no verdict |
| 3 | validation refused: a secret pattern or malformed record was detected; nothing written |
| 4 | usage error: missing env var, unknown gate id, or a forbidden key flag |
| 1 | unexpected crash; stack trace captured to the raw log |

A record is written even on exit 2, because a blocked gate is evidence of an environment problem
rather than an answer. Records are written to a temp file under `evidence/rpc-log/` and renamed into
place only after validation, so an interrupted run cannot produce a half-valid record.

## Output contract

Every gate command must:

1. Record its own exact invocation, with env var names only, into the record's `commands`.
2. Capture stdout and stderr of every external call (`forge`, `cast`, RPC) into
   `evidence/raw/<gate-id-lowercase>/<n>-<label>.txt`.
3. Write the JSON record last, after `evidenceFiles` all exist.
4. Print a one-screen summary to stdout: gate id, run state, verdict when present, key numbers,
   record path. Never a key.
5. Leave the daemon untouched; a gate never stops or restarts the probe.

Path rule: every `evidence/` path resolves from the repository root derived from the module's own
location (`import.meta.url`), never from `cwd`. Gate commands are run from `apps/gates/`, and a
`cwd`-relative path would write evidence into `apps/gates/evidence/`, where `validate` and `rollup`
would not find it. Record paths use lowercase gate ids (`g01.json`, `raw/g01/`); display ids stay
uppercase.

## Safety guards

- `config.ts` refuses to run if any loaded key is shorter than 32 bytes, is the all-zero key, or
  matches a known public test key fixture.
- `evidence.ts` runs `sanitize()` on every string written, rejecting loaded secret values and any
  `0x` + 64-hex string that is not a hash, address or signature already declared in the record.
- Balance-affecting commands check the sender's balance first and refuse to run if the estimated
  cost would leave less than the configured reserve.
- The harness never writes to `.env` except through `npm run keygen`, which refuses to overwrite an
  existing file, writes mode 600 and prints only public addresses. It never rotates keys and never
  moves funds between accounts except the single documented mapping test.
