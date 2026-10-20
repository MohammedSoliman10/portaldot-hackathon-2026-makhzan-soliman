# CLI and Daemon Contract

**Feature**: `002-core-storage-proofs` | **Package**: `apps/makhzan/`

One Node package, two entry points: `daemon` (the provider side) and `cli` (the client side and the
operator tools). No server, no database, one JSON state file.

## Client CLI (`npm run cli -- <command>`)

| Command | Inputs | Effect | Writes |
| --- | --- | --- | --- |
| `upload <file> --provider <id>` | file path, provider id | chunk the file by the deployment's `challengeBlockSize`, build leaves/root/paths, send every block to the daemon in order, wait for the daemon's acknowledgement of `(root, size, leafCount)` | `evidence/raw/t1/upload-<root>.txt`, state entry |
| `create --root <root> --size <n> --leaf-count <n> --provider <id> --duration <blocks> --price <tPOT>` | committed values | call `createDeal` with `msg.value == price`, wait for finality, read the deal back | evidence record with the five statuses |
| `challenge <dealId>` | deal id | call `challenge`, read the opened index and deadline back | evidence record |
| `watch <dealId>` | deal id | poll `challengeStateOf` until the round resolves, then read back the outcome and the provider bond | evidence record |
| `claim <dealId>` / `settle <dealId>` | deal id | call the payment function, read balances back | evidence record |
| `report` | — | collect state records into `evidence/tier1-results.md` | report file |

All commands: sign in-process with `viem` from environment variables; `gas = estimate × 1.2`;
`maxFeePerGas = chain gas price`; `maxPriorityFeePerGas = 0`; never print a key; never accept a key
on argv (the tier-0 argv guard is reused).

## Provider daemon (`npm run daemon`)

| Endpoint / cycle | Behaviour |
| --- | --- |
| `POST /upload` (local, loopback) | validate the envelope (bounded fields, exact root/size/leafCount, ordered block index, byte lengths), write blocks under `.state/files/<root>/`, return an acknowledgement containing `(root, size, leafCount)`. Rejects anything malformed with a verbatim reason |
| poll cycle (every ≤ 6 s) | for each known active deal: read `challengeStateOf`; on an open challenge, read the block at `challengeIndex`, rebuild the path, submit `answer`, record the five statuses |
| bad-answer drill mode | a flag to deliberately answer with the wrong bytes or skip an answer, used only to produce the required failed-and-slashed evidence, recorded as such |
| recovery | on restart, re-read state, re-derive paths from stored blocks, resume polling; report what it cannot serve instead of guessing |

Discovery is **state polling only**. The daemon never calls `eth_getLogs` over a historical range
(the public RPC prunes state; tier-0 DR-001). If a challenge is open on a deal the daemon has never
heard of, it reports `unanswerable: unknown deal` and records it.

## State file schema (`.state/state.json`, gitignored)

```json
{
  "chainId": 420420777,
  "providerId": 1,
  "lastBlock": 123456,
  "files": { "<root>": { "size": 1048576, "leafCount": 1024, "path": ".state/files/<root>" } },
  "deals": { "1": { "role": "provider" | "client", "owner": "0x..", "providerId": 1,
                    "lastChallenge": { "index": 7, "start": 123000, "status": "passed" } } }
}
```

Atomic write (temp file + rename). Missing file is not an error: the daemon rebuilds what it can and
reports the gap.

## Upload envelope (validated, untrusted input)

```json
{ "root": "0x..", "size": 1048576, "leafCount": 1024, "blockSize": 1024,
  "index": 0, "data": "0x.." }
```

One block per request, sent in ascending index order. The daemon:
1. requires exactly these fields, no more; 2. requires `blockSize` equal to the configured value;
3. requires `index < leafCount`; 4. requires `data.length` equal to the expected length for that
index; 5. requires `leafHash(data)` to match the leaf at that index of the sender's declared tree
once every block has arrived; 6. acknowledges only when the whole file is present and the recomputed
root equals the declared root.

## Status pipeline (shared by CLI and daemon)

Every transaction record contains: `submitted` (hash, nonce), `included` (block number and hash),
`executed` (receipt status), `finalized` (`finalized` block tag, or `heuristic(confirmations=N)` with
the count), `readBack` (named view calls and their returns). A component refuses to act on a state
that is earlier than `executed` and refuses to print `finalized` unless it observed it.
