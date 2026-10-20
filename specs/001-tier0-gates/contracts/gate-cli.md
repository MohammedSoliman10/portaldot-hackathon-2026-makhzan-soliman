# Interface Contract: Gate CLI

**Feature**: `001-tier0-gates` | **Version**: 1.0 (2026-10-20)

The harness is a headless command line. Every gate is one command that writes one JSON record and
one raw log directory, exits non-zero when no verdict could be reached, and never prints a secret.

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
- Keys are read from the environment (or a gitignored `.env`) and used only for in-process signing.
- No command takes a key as an argument. `--private-key`, `--mnemonic` and `--seed` are rejected by
  a guard in `config.ts` before anything runs.
- Values are never printed, including in `--verbose` mode.

## Commands

| Command | Gate | Writes |
| --- | --- | --- |
| `npm run probe` | G10 | `evidence/rpc-log/<date>.jsonl`, continuously |
| `npm run gate -- G07` | G7 | `evidence/gates/G07.json`, `evidence/raw/G07/` |
| `npm run gate -- G01` | G1 | `evidence/gates/G01.json`, `evidence/raw/G01/` |
| `npm run gate -- G02` | G2 | `evidence/gates/G02.json`, `evidence/raw/G02/` |
| `npm run gate -- G03` | G3 | `evidence/gates/G03.json`, `evidence/raw/G03/` |
| `npm run gate -- G04` | G4 | `evidence/gates/G04.json`, `evidence/raw/G04/` |
| `npm run gate -- G05` | G5 | `evidence/gates/G05.json`, `evidence/raw/G05/` |
| `npm run gate -- G06` | G6 | `evidence/gates/G06.json`, `evidence/raw/G06/` |
| `npm run gate -- G08` | G8 | `evidence/gates/G08.json`, `evidence/raw/G08/` |
| `npm run gate -- G09` | G9 | `evidence/gates/G09.json`, `evidence/raw/G09/` |
| `npm run rollup` | all | `evidence/tier0-results.md` from the records (refuses on missing records) |
| `npm run validate` | all | schema + secret check over `evidence/`; no writes on success |

Ordering: `G10` starts first and keeps running. The gate order after that is fixed:
G07 → G01 → G02 → G03 → G04 → G05 → G06 → G08 → G09. `G01` blocks the rest on a hard failure.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | verdict written (PASS, FAIL or PARTIAL) and every artifact saved |
| 2 | blocked: environment or network prevented the run; no verdict written; error recorded |
| 3 | validation refused: a secret pattern or malformed record was detected; nothing written |
| 4 | usage error: missing env var, unknown gate id, or a forbidden key flag |
| 1 | unexpected crash; stack trace captured to the raw log |

A non-zero exit never leaves a partial JSON record behind: records are written to a temp file under
`evidence/rpc-log/` and renamed into place only after validation, so an interrupted run cannot
produce a half-valid verdict.

## Output contract

Every gate command must:

1. Record its own exact invocation, with env var names only, into the record's `commands`.
2. Capture stdout and stderr of every external call (`forge`, `cast`, RPC) into
   `evidence/raw/<gate>/<n>-<label>.txt`.
3. Write the JSON record last, after `evidenceFiles` all exist.
4. Print a one-screen summary to stdout: gate id, verdict, key numbers, record path. Never a key.
5. Leave the daemon untouched; a gate never stops or restarts the probe.

## Safety guards

- `config.ts` refuses to run if any loaded key is shorter than 32 bytes, is the all-zero key, or
  matches a known public test key fixture.
- `evidence.ts` runs `sanitize()` on every string written, rejecting loaded secret values and any
  `0x` + 64-hex string that is not a hash, address or signature already declared in the record.
- Balance-affecting commands check the sender's balance first and refuse to run if the estimated
  cost would leave less than the configured reserve.
- The harness never writes to `.env`, never rotates keys and never moves funds between accounts
  except the single documented mapping test.
