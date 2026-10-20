# Research: Tier 0 Chain Gates

**Feature**: `001-tier0-gates` | **Date**: 2026-10-20

Phase 0 resolves the open technical choices in the plan. Two things are deliberately **not** settled
here because the feature exists to measure them: the chain's real compiler path (G2) and the
native-to-EVM decimal relationship (G7). They are recorded as hypotheses with a test each.

## D1 — Toolchain and transaction signing

**Decision**: Foundry `1.8.5` for compiling, local testing and `anvil`; `viem` for every live
transaction, signed in-process from an environment variable.

**Rationale**: `viem` keeps the private key out of `argv`, where `forge create --private-key` and
`cast send --private-key` would expose it in shell history, process listings and the evidence log.
It also lets the harness set the transaction type explicitly, which matters on a chain whose fee
market may not be Ethereum-shaped. Foundry remains the compiler and local test runner because the
project's rules already assume it.

**Alternatives considered**: `cast send --private-key` (rejected: key on argv); `forge create`
(rejected for the same reason, and its deploy path hides the raw transaction); `ethers.js` (no
advantage over `viem`, larger surface); a keystore file on disk (rejected: another secret to manage,
and env vars are what the rules require).

## D2 — Compiler path: `solc` to EVM vs `resolc` to PolkaVM

**Decision**: Dual-track. Start with `solc` `0.8.28` with `evm_version = paris`; on the first
deployment rejection or semantic mismatch, switch to `resolc` in the same gate run and record which
path worked. Pin the winning compiler in `foundry.toml` only after G2, as instructed.

**Rationale**: The chain is described as running `pallet-revive`, which executes PolkaVM code, while
also exposing an EVM RPC. Parity's documentation for pallet-revive describes compiling Solidity with
`resolc`, and the chain's EVM compatibility layer is what makes the EVM RPC possible. The starting
facts come from the owner and may be stale, so the plan treats the compiler path as the question G2
answers, not as something to assume. `paris` is the conservative EVM target: it predates `PUSH0`,
transient storage and `MCOPY`, so bytecode produced for it is the most likely to be accepted.

**Alternatives considered**: Committing to `resolc` up front (rejected: heavier setup, and if plain
`solc` works the whole tier gets simpler); committing to `solc` and treating failure as a gate
failure (rejected: that would turn a toolchain fact into a false fallback trigger); using the
chain's own contract wizard or Remix (rejected: not reproducible from the repo).

**Open hypothesis**: G1 succeeds on one of the two paths within two serious attempts / 48h. If
neither works, that is a fallback trigger, not a design change.

## D3 — Evidence format

**Decision**: One JSON record per gate (`evidence/gates/Gxx.json`) plus verbatim raw output under
`evidence/raw/Gxx/`, rolled up into `evidence/tier0-results.md`. JSON records follow a fixed schema
and carry the UTC timestamp, the exact command, the endpoint, and the tx hashes or error text.

**Rationale**: A markdown table alone cannot be checked mechanically; JSON alone is unreadable to a
judge. Keeping both means the results document can be generated and audited against the records,
while a human can read the table without opening ten files. Raw output stays separate so the JSON
record can never quietly paraphrase an error.

**Alternatives considered**: Markdown only (rejected: unverifiable claims, no schema); a database
(rejected by constraints); a single combined JSON file (rejected: merge conflicts and all-or-nothing
commits, against the small-commit rule).

## D4 — Background probe (G10)

**Decision**: A Node daemon (`apps/gates/src/probe/daemon.ts`) that ticks every 180 s, writes one
JSON object per line to `evidence/rpc-log/<UTC date>.jsonl`, and rotates the file at UTC midnight.
Each tick records: UTC timestamp, EVM HTTP reachability and latency, `eth_chainId`, `eth_blockNumber`,
WS reachability and latency, and the WS-reported best block. Failures record the verbatim error
string and the elapsed time. The daemon is started before G7 and left running.

**Rationale**: JSON Lines appends are atomic at line granularity, survive a crash mid-run, and need
no read-modify-write of a growing array. Daily rotation keeps files small and makes gaps obvious.
Recording both HTTP and WS is required because the harness needs the EVM side and the Substrate side
independently. Node 24 has global `fetch` and `WebSocket`, so the daemon adds no dependency.

**Alternatives considered**: A shell loop with `curl` + `jq` (rejected: two more tools, and JSON
escaped in shell is error-prone); `systemd` timer (rejected: not portable, and the machine is a
laptop); writing one growing file (rejected: unbounded and hard to diff).

## D5 — Gas measurement method

**Decision**: Primary method is `eth_estimateGas` for each operation, with a fallback to
`gasUsed` from the mined receipt and A/B differencing (same call with and without the payload) when
estimation is unavailable or rejected. Every record states which method produced the number.

**Rationale**: `eth_estimateGas` is cheap and does not spend funds, but an EVM compatibility layer
may implement it differently from execution, and it may fail on calls that would succeed. Receipts
are ground truth for mined transactions but cost funds and cannot be repeated freely. Recording the
method keeps later readers from comparing numbers that were produced differently.

**Alternatives considered**: `debug_traceTransaction` (likely unavailable or disabled on a public
testnet RPC, and heavy); assuming Ethereum gas constants (rejected: this is exactly what the tier is
testing); `eth_call` with a gas cap probe (kept as a cross-check only).

## D6 — Payload and contract-size ladders

**Decision**: For maximum calldata, call a no-op sink function with increasing payload sizes
(1 KiB steps, then binary search) until the node rejects the transaction; record the rejection
verbatim. For contract size, deploy padding contracts of increasing runtime size until rejection;
record the error. Both ladders stop at the first rejection and record the last accepted size.

**Rationale**: Limits are enforced by the node or runtime, not by the compiler, so they must be
probed empirically. Binary search after a coarse ladder keeps the number of funded transactions
small. Stopping at the first rejection avoids burning funds on a limit already known.

**Alternatives considered**: Reading the runtime's constants from source (rejected: the deployed
runtime may differ from any published value); trusting EVM's 24 KiB limit (rejected: pallet-revive
may impose a different bound, and that is the point of the gate).

## D7 — Randomness sampling (G3)

**Decision**: Sample 30+ consecutive blocks, reading in each: `blockhash(n-1)` from a contract call,
`block.prevrandao`, `block.number` and `block.timestamp`. Record whether values repeat, whether
`blockhash(n-1)` is readable (non-zero) at execution time, and whether the value is known before the
block that uses it. Verdict uses the spec's definition: usable means unpredictable to a provider
before the challenge is issued and readable on-chain at verification time.

**Rationale**: `prevrandao` on an Ethereum-shaped chain is the beacon randomness value; on a
Substrate-based chain it may be a constant, a hash of the parent, or zero. Only sampling consecutive
blocks shows whether it varies and whether it can be predicted one block ahead. The sample size
matches the gate's minimum and is enough to detect a constant or a repeating cycle.

**Alternatives considered**: Reading the runtime's randomness source via the Substrate API only
(rejected: the contract is what needs the value, so it must be read from contract context);
`blockhash(n)` (not readable by definition at execution time); a single sample (rejected: cannot
distinguish constant from varying).

**Fallback design if unusable**: commit-reveal. The provider commits `H(blockBytes || nonce)` in the
deal, the challenger picks the index after the commitment is fixed, and the provider reveals the
bytes and nonce; the contract checks the commitment. Cost: one extra hash and one extra storage
write per deal, plus a reveal window. Latency: challenge resolution waits for the reveal
transaction. This is stated as the alternative in the results, not implemented in this tier.

## D8 — Merkle probe construction (G4c, XV, XVI)

**Decision**: Implement the reference construction inside the probe:
- leaf hash = `keccak256(0x00 || leafBytes)`, node hash = `keccak256(0x01 || left || right)`;
- the deal commits the leaf count and the root;
- path directions are derived on-chain from the challenged index and the committed leaf count;
- odd nodes at a level are promoted unchanged (documented as the chosen rule);
- verification takes the challenged bytes, their index and the sibling path, recomputes the leaf
  hash locally, and compares to the committed root;
- a negative test proves a proof built for index `i` fails at index `j`, and a test proves a
  hash-only response is rejected.

**Rationale**: Each rule maps to a specific forgery: without domain separation a leaf hash can be
reinterpreted as a node hash; without a committed leaf count, trees of different sizes can share a
root shape; without index-derived directions, a prover can choose the path; without promotion rules,
non-power-of-two trees have ambiguous shapes; without bytes in the response, possession is not
proven. Writing the tests first is required by the constitution and gives G4 a correctness baseline
before any cost number is trusted.

**Alternatives considered**: Sparse Merkle tree with fixed depth (rejected for this probe: more
hashing per proof and a different cost profile, worth revisiting only if the plain tree fails the
gas gate); sorted-pair hashing (rejected: allows proof reordering, weaker than domain separation);
verifying a hash-only response against a separately supplied preimage (rejected by the
constitution).

## D9 — Account mapping and the 14-decimal question (G7)

**Decision**: Create six burner accounts from environment variables. Fund each through the faucet or
an administrator using its SS58 address. Then, for each account, call `pallet_revive.map_account`
from the Substrate side and record the resulting EVM address; verify with `eth_getBalance`, a small
value transfer to the mapped address, and a contract call that reports `msg.value`. Record native
balance (Substrate `system.account`), EVM balance, and the ratio implied by the token's decimals.

**Rationale**: Parity's documentation states that a native Substrate account must call
`pallet_revive.map_account` before its H160 view is usable, and that funding happens on the SS58
side. The decimal question cannot be answered by reading docs alone because the EVM view may use 18
decimals while the native token uses 14; measuring both sides of one account with worked examples
is the only way to know the conversion the product must use.

**Alternatives considered**: Funding the EVM address directly (rejected: the faucet pays SS58, and a
direct transfer would not test the mapping); assuming a 10^4 factor (rejected: the factor is what
the gate measures); using a single account (rejected: the spec requires six roles and per-role
balances).

**Hypothesis under test**: native balance appears in the EVM view scaled by `10^(18-14)` and
`msg.value` is denominated in the EVM view. If the measured factor differs, it is a design change
recorded in `docs/decisions.md`.

## D10 — Storage cost measurement (G5)

**Decision**: Deploy the storage probe, write one realistic deal record (identifier, provider,
root, leaf count, size, bond, deadline, state), record the gas and the reported deposit, then write
one additional value and record the marginal cost. Read balances before and after to separate the
deposit from the fee where the chain exposes a deposit.

**Rationale**: "Storage deposit" is a Substrate concept; on a chain with both a deposit and a fee,
conflating them would overstate per-deal cost. The realistic record matters because slot count, not
byte count, drives cost on an EVM-shaped runtime.

**Alternatives considered**: Estimating from slot count multiplied by a published constant
(rejected: the constant is a starting fact, not a verified one); measuring with a toy record
(rejected: it would understate the per-deal cost the product must budget for).

## D11 — Identity and assets (G8, G9)

**Decision**: G8 queries `identity.identityOf` for a known account, then attempts `identity.setIdentity`
with a burner and reads it back, recording any deposit requirement and the exact extrinsic error.
G9 probes a short list of candidate asset-precompile addresses with `eth_call` for `name()`,
`symbol()`, `decimals()`, `totalSupply()` and `balanceOf(address)`, records raw return data and
errors, and also queries the `assets` pallet metadata on the Substrate side to say whether assets
exist at all.

**Rationale**: The brief asks whether the pallet exists and whether a provider can set an identity,
which is exactly two probes: a storage read and a write. The asset precompile's address cannot be
assumed, so trying a small candidate list plus the Substrate-side pallet is more informative than a
single guessed address. G9 is optional, so every outcome is recorded without failing the tier.

**Alternatives considered**: Reading only runtime metadata (rejected: it shows the pallet exists but
not that a precompile responds); a full ERC-20 ABI sweep over many addresses (rejected: noisy and
slow).

## D12 — RPC failure protocol

**Decision**: Every gate script wraps network calls with a recorded-failure path: catch, capture the
verbatim error and UTC time, append to the gate's raw log, exit non-zero without writing a verdict.
A blocked gate is retried later; the probe keeps logging. A gate is only marked partial after a
retry also fails, and the retry reasons are recorded.

**Rationale**: The rules require the exact error and time, not a paraphrase, and a failed attempt
must not become a verdict. Exiting non-zero keeps "no verdict yet" distinguishable from "failed
gate" in the shell history and in CI.

**Alternatives considered**: Auto-retry loops inside the script (rejected: hides the outage and can
mask a real failure); writing a provisional FAIL (rejected: violates the evidence rule).

## D13 — Secret hygiene

**Decision**: `config.ts` loads `.env` if present (gitignored), requires the named variables, and
never prints values. A `sanitize()` step in `evidence.ts` scans every string before it is written for
the loaded secret values and for `0x`-prefixed 32-byte hex, refusing to write if a match is found.
Signing happens in-process; recorded commands use env var names, never values.

**Rationale**: Evidence is copied to a sync folder and committed, so a single leaked key in a raw log
would escape the repository. A programmatic check is stronger than remembering to look. A 32-byte hex
match also catches keys that were not loaded from env, such as one pasted into a command.

**Alternatives considered**: Manual review before commit (rejected: the rules say never, and manual
review fails eventually); a git pre-commit hook only (kept as a second line, not the primary one).

## D14 — Dependency pinning and disclosure

**Decision**: Exact versions, no ranges, in `apps/gates/package.json`, with `package-lock.json`
committed. README gains a dependency table listing `viem`, `@polkadot/api`,
`@polkadot/util-crypto`, `typescript`, Foundry and Spec Kit, each with version and licence.

**Rationale**: Ranges make a stranger's run diverge from the recorded one, which breaks
reproducibility. The constitution requires disclosure, and a table is the smallest honest form.

**Alternatives considered**: `pnpm`/`bun` (rejected: not installed, and npm is the baseline); caret
ranges (rejected: reproducibility); `ethers` + `@polkadot/api` (rejected: two EVM libraries).

## D15 — Probe testing strategy

**Decision**: For each probe contract, write `forge` tests first: unit tests for storage, events,
revert, value transfer and time/block reads; fuzz tests for the Merkle verifier (random leaf sets,
non-power-of-two counts, wrong index, wrong bytes, hash-only response); invariant tests for the
value-holding paths (balance conservation in the transfer probe). Tests must fail before the probe
exists, and the failing run is kept in the gate's raw log.

**Rationale**: The constitution requires failing tests before implementation for anything holding
value, and fuzzing is the only realistic way to cover the Merkle edge cases. Keeping the failing run
as evidence also proves the tests were not written after the fact.

**Alternatives considered**: Testing only on the live chain (rejected: slow, costs funds, and cannot
fuzz); property tests in TypeScript against a JS mirror (rejected: duplicates the logic under test).

## Open items carried into the tasks

- Exact `solc` version to pin is decided by G2; `0.8.28` is provisional.
- Whether the faucet pays enough per account for the 14-day cost calculation is unknown until G7.
- Whether the testnet exposes a deposit separate from fees is unknown until G5.
- Whether an ERC-20 precompile exists at all is unknown until G9.
