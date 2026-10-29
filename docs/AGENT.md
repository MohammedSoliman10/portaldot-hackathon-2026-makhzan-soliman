# The Makhzan agent (read-only MCP server)

`apps/makhzan-mcp` is a small [Model Context Protocol](https://modelcontextprotocol.io/) server that
lets an AI agent **read** Makhzan: a deal's health, whether a local file is the file the deal commits
to, the deal's history, and a StorageGate's lock. It is a verification tool. It has no wallet, no key,
no write tool, and no way to spend anything.

- Transport: stdio, JSON-RPC 2.0, official TypeScript SDK `@modelcontextprotocol/sdk` 1.32.2.
- Answers come from the chain the operator names in the environment, and nothing else.
- Every answer's first line is `[MEASURED]`, and the line above the signature says which parts are
  derived (blocks left, the guard decision, the release verdict) so a reader can tell them apart.
- Live transcript: `evidence/raw/t2/121-mcp-live-transcript.txt`. Unit tests: `evidence/raw/t2/120-*`.

## What it is not

It is not an agent that acts. It cannot create a deal, open or answer a challenge, claim, settle,
register a provider, lock or release a gate payment, or sign anything. There is no such code path: its
whole read surface is two client calls (`eth_chainId`, `eth_blockNumber`) and seven `view` calls
(`dealOf`, `healthOf`, `providerOf`, `accruedOf`, `challengeStateOf`, `makhzan()`, `lockOf`). The
config refuses to start if a key variable is present, and a test fails if any tool name looks like a
write.

## Prerequisites

Node 24, and the package's dependencies installed once:

```bash
cd apps/makhzan-mcp
npm ci
```

`node_modules/` is not committed. The server runs TypeScript directly (`node src/main.ts`), like the
rest of this repo, so there is no build step.

## The four tools

| Tool | Arguments | Returns |
| --- | --- | --- |
| `makhzan_health` | `dealId` | `healthOf` code and name, `endBlock`, blocks left (negative = term over), and the MakhzanGuard decision: `healthy`, `pending`, `default`, `settled-or-none`, `expired` |
| `makhzan_verify_file` | `dealId`, `path`, optional `referencePath` | sha256 and size of the local file, the rebuilt Merkle root, the on-chain root, and `MATCH` or `MISMATCH`. Scoped to `MAKHZAN_VERIFY_DIR`. |
| `makhzan_deal_story` | `dealId` | the deal's events in block order (created, opened, passed, failed, claimed, settled) and the same PASS/FAIL check list the CLI's `verify` prints, ending in `RESULT: PASS`, `FAIL` or `INCOMPLETE` |
| `makhzan_gate_status` | `dealId` | gate address, lock status, payer, payee, amount, `minBond` floor, the payee provider's bond, and whether `release` would pass now |

### The guard decision

`healthOf` alone does not answer "may a consumer pay?". `MakhzanGuard.requireHealthy` requires
`healthOf == 1` **and** `block.number < endBlock`. `makhzan_health` prints both facts and the decision
they imply, and says on the same line that the decision is derived, not read.

### Verifying a file, honestly

The deal commits a 32-byte Merkle root and a leaf count. It does not store the blocks. So:

- **Equal roots** prove the file is the committed content.
- **Different roots** prove it is not — but from the chain alone no individual block can be named,
  and the tool does not invent one. Pass `referencePath` with a second copy that does hash to the
  committed root and the first differing block is named exactly; that comparison is local.

The chunker and the tree are imported from `apps/makhzan/src/{chunk,merkle}.ts`, the same modules the
browser verifier and the contract tests use, so the hashing rule cannot drift. A size or leaf-count
mismatch is an error, never a verdict.

File paths for both `path` and `referencePath` are strictly confined to `MAKHZAN_VERIFY_DIR`
(defaulting to `process.cwd()`). Traversal attempts (`../`), absolute paths outside the folder,
and symlinks that point outside are rejected before any file is opened or hashed.

### The gate verdict

With no gate address configured the answer is `gate not deployed` — the live Portaldot deployment has
no StorageGate, and an invented address would be worse than no answer. With a gate configured, the
tool first checks `gate.makhzan()` equals the Makhzan it was pointed at, then evaluates exactly the
conditions `StorageGate.release` evaluates (lock open, guard healthy, `minBond` floor satisfied) and
names the one that fails (`NotLocked`, `Pending`, `BondTooLow`, …). It never builds that transaction.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `MAKHZAN_RPC_URL` | yes | JSON-RPC endpoint, for example `https://test-evm-rpc-v3.portaldot.dev` |
| `MAKHZAN_CHAIN_ID` | yes | chain id, `420420777` on the Portaldot V3 testnet |
| `MAKHZAN_CONTRACT` | yes | Makhzan address, `0x60481DFcFCA34A8F095939D9675eC715127B2e44` live |
| `MAKHZAN_GATE` | no | StorageGate address; unset means "gate not deployed" |
| `MAKHZAN_VERIFY_DIR` | no | the only directory `verify_file` may read, default current working directory (`process.cwd()`); path escapes (`../`), outside absolute paths, and outward-pointing symlinks are refused |
| `MAKHZAN_BLOCK_SIZE` | no | challenge block size, default `1024`; it must reproduce the deal's leaf count or `verify_file` refuses |
| `MAKHZAN_RPC_TIMEOUT_MS` | no | per-attempt budget, default `8000`; one retry follows a failure |

There is no default network. The server exits with code 2 and one stderr line naming the missing
variable rather than guessing. It also refuses to start if any key-like variable is present
(`MAKHZAN_PRIVATE_KEY`, `OWNER_KEY`, `PROVIDER_1_KEY`, `MNEMONIC`, …): it names the variable and never
reads or prints the value.

## Claude Desktop

Open **Settings → Developer → Edit Config** and add this entry to `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows:
`%APPDATA%\Claude\claude_desktop_config.json`). Use an **absolute** path — the app does not expand
`~`.

```json
{
  "mcpServers": {
    "makhzan": {
      "command": "node",
      "args": ["/absolute/path/to/portaldot-hackathon/apps/makhzan-mcp/src/main.ts"],
      "env": {
        "MAKHZAN_RPC_URL": "https://test-evm-rpc-v3.portaldot.dev",
        "MAKHZAN_CHAIN_ID": "420420777",
        "MAKHZAN_CONTRACT": "0x60481DFcFCA34A8F095939D9675eC715127B2e44"
      }
    }
  }
}
```

Quit and reopen Claude Desktop. The four tools appear under the connectors menu.

## Claude Code

One command, writing to local scope:

```bash
claude mcp add --transport stdio makhzan \
  --env MAKHZAN_RPC_URL=https://test-evm-rpc-v3.portaldot.dev \
  --env MAKHZAN_CHAIN_ID=420420777 \
  --env MAKHZAN_CONTRACT=0x60481DFcFCA34A8F095939D9675eC715127B2e44 \
  -- node /absolute/path/to/portaldot-hackathon/apps/makhzan-mcp/src/main.ts
```

Check it with `claude mcp get makhzan`, or `/mcp` inside a session. To share it with everyone in the
repository, put the same shape in `.mcp.json` at the project root (project scope) and approve it on
first use:

```json
{
  "mcpServers": {
    "makhzan": {
      "type": "stdio",
      "command": "node",
      "args": ["apps/makhzan-mcp/src/main.ts"],
      "env": {
        "MAKHZAN_RPC_URL": "https://test-evm-rpc-v3.portaldot.dev",
        "MAKHZAN_CHAIN_ID": "420420777",
        "MAKHZAN_CONTRACT": "0x60481DFcFCA34A8F095939D9675eC715127B2e44"
      }
    }
  }
}
```

The relative `args` path works in `.mcp.json` because Claude Code starts project-scoped stdio servers
from the project root; the Claude Desktop snippet must be absolute.

## An example run

This is the transcript the scripted client produced on 2026-10-29 against the live testnet
(`evidence/raw/t2/121-mcp-live-transcript.txt`), trimmed to one deal. The agent asked; the server
answered; nothing was signed.

```text
tools (4):
  makhzan_health  readOnlyHint=true destructiveHint=false  input=["dealId"]
  makhzan_verify_file  readOnlyHint=true destructiveHint=false  input=["dealId","path","referencePath"]
  makhzan_deal_story  readOnlyHint=true destructiveHint=false  input=["dealId"]
  makhzan_gate_status  readOnlyHint=true destructiveHint=false  input=["dealId"]

[request]  tools/call makhzan_health {"dealId":2}
[response]
  [MEASURED] makhzan_health — deal 2
  chain 420420777, Makhzan 0x60481DFcFCA34A8F095939D9675eC715127B2e44, read at block 240397
  healthOf 0 (settled-or-none)
  term over by 67,519 blocks (head 240397, endBlock 172878)
  MakhzanGuard decision: settled-or-none — the deal is settled or does not exist
  label: MEASURED for healthOf and the block number; DERIVED for blocksLeft and the guard decision.

[request]  tools/call makhzan_gate_status {"dealId":2}
[response]
  [MEASURED] makhzan_gate_status — deal 2
  gate not deployed: MAKHZAN_GATE is unset, so there is no StorageGate address to read.
  Nothing about a lock, a payee or a bond is inferred. Set MAKHZAN_GATE to a deployed gate and ask again.
  label: MEASURED — the absence of configuration is the measured fact here.

[request]  tools/call makhzan_verify_file {"dealId":2,"path":".../public/samples/demo-1mib.bin"}
[response]
  [MEASURED] makhzan_verify_file — deal 2
  file .../public/samples/demo-1mib.bin
  size 1,048,576 B, sha256 0x7f2fd6d50bfe106c35d95a8aaef403c4b2ca53df7cb4ef1bca9b9fa8cb89e21e
  blocks 1,024 × 1,024 B (last block 1,024 B)
  rebuilt root 0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7
  on-chain root 0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7
  MATCH: the file hashes to the root deal 2 commits.
  label: MEASURED for the roots and the digest; the hashing rule is the contract's (0x00 leaf, 0x01 node).

=== negative checks ===
[request]  tools/call makhzan_health {"dealId":999}
[response] isError=true: deal 999 does not exist on 0x60481DFcFCA34A8F095939D9675eC715127B2e44 (owner is the zero address)

[request]  tools/call makhzan_write_deal {}
[response] isError=true: MCP error -32602: Tool makhzan_write_deal not found
```

A model reading this can say: deal 2 is settled and its term is over; the gate is not deployed, so
there is nothing to release; the 1 MiB sample is exactly the file deal 2 committed. It cannot say
anything about a payment, because there is no tool that could make one.

To reproduce the whole transcript (about 40 s on the live node):

```bash
cd apps/makhzan-mcp
node scripts/live-client.mjs
```

## Limits, stated plainly

- **Read-only.** No tool sends a transaction; there is no signer in the process. The server also
  refuses to start when a key variable is in its environment, so an operator cannot arm it by mistake.
- **No payments.** Nothing here moves tPOT. `makhzan_gate_status` predicts what `release` would do; it
  does not release.
- **No autonomous spending.** The tools cannot spend, and the server has no funds. Connecting it to an
  agent does not give that agent a budget.
- **Scoped filesystem access (MAKHZAN_VERIFY_DIR).** `verify_file` only reads files inside `MAKHZAN_VERIFY_DIR` (defaulting to the process working directory). Traversal (`../`), outside absolute paths, and outward-pointing symlinks are rejected before opening or hashing. The previous open risk of the tool serving as an unbounded hash oracle over the host filesystem is mitigated.
- **Root, not bytes.** `verify_file` proves a file matches the committed root. It cannot prove where
  the file came from, and on a mismatch it cannot name a bad block without a reference copy.
- **Not continuous storage.** A MATCH proves the local file equals what was committed. It says nothing
  about whether the provider still holds a copy; only a challenge does that.
- **One node's view.** Every number is what the configured RPC returned at that block. A lagging or
  lying node produces confidently labelled wrong numbers; point it at a node you trust.
- **Timeouts.** Each RPC attempt is capped (8 s by default) and retried once. A huge `eth_getLogs`
  range can take longer overall; a node that refuses the range is reported as `INCOMPLETE`, never as
  a pass.
- **Not audited.** Same as the contract it reads.

## Tests

```bash
cd apps/makhzan-mcp
npm run typecheck
npm test          # 46 tests, no network: a fake Read surface and an in-memory MCP transport
node scripts/live-client.mjs   # the live transcript above, read-only
```

The unit tests cover the guard mapping (including the exact `head == endBlock` boundary), the retry
budget, the config refusals (including "a key is present" and "the message must not echo the value"),
`verify_file` match / mismatch / size / leaf-count / missing file / bad reference, the gate verdict for
each failing condition, `gate not deployed`, a gate pointing at another Makhzan, story history and an
`INCOMPLETE` log range, and the server itself: exactly four tools, each `readOnlyHint`, no write-ish
name, MEASURED text, and errors returned as errors rather than as verdicts.
