# Research: Core Storage Proofs

**Feature**: `002-core-storage-proofs` | **Date**: 2026-10-21

Phase 0 resolves every open technical choice in the plan. Four things are deliberately **not**
settled by planning because Tier 0 exists to measure them: the live compiler path (G02), the
final challenge block size (G04), the real deposit numbers (G05) and the usability of on-chain
randomness (G03). Each is a named hypothesis with a decision point, not an assumption.

## D1 — Toolchain, compiler pins and size policy

**Decision**: Foundry `1.8.5` with `solc 0.8.28`, `evm_version = "paris"`, `optimizer = true`,
`optimizer_runs = 1`, `bytecode_hash = "none"`, `cbor_metadata = false`. `via_ir` stays off unless a
measured build is smaller with it on, and that measurement is recorded with the budget entry.
`forge-std 1.17.0` is used in tests only. No OpenZeppelin import.

**Rationale**: Deployed bytes are charged to the operator (reported ≈ 0.079 tPOT/byte plus ≈ 13 tPOT
per contract, to be confirmed by G05), so the binding constraint is code size, not execution gas at
demo volume. `runs = 1` minimises runtime size; `bytecode_hash = "none"` and `cbor_metadata = false`
remove the metadata trailer; `paris` avoids `PUSH0`, transient storage and `MCOPY`, which the live
chain has not been proven to accept. Removing metadata also makes byte-for-byte size checks stable.
`solc 0.8.28` / `paris` remain provisional until G02 records the live verdict.

**Alternatives considered**: `runs = 200` (tier-0 default; larger runtime code and no benefit here);
`via_ir` by default (slower builds, and the size effect must be measured rather than assumed); a
custom assembly verifier to shrink further (rejected as premature: the measured skeleton already
fits with margin, and hand-written assembly in the verification path is exactly where the
constitution's Merkle rules need readable code).

**Evidence**: `/tmp/opencode/t1-notes/00-size-feasibility.txt` (scratch, planning only). To be
reproduced inside the repository by the first implementation task and stored under `evidence/raw/t1/`.

## D2 — One contract, modular at source level

**Decision**: A single deployed contract `Makhzan` implementing `IMakhzan`, composed from internal
libraries `MerkleLib` (verification), `BondLib` (registry, bond accounting, exit guard) and
`PayLib` (accrual, claim, settle, slash). Internal libraries are inlined by the compiler, so they
cost no deployment of their own. A never-deployed `Lens` is only considered if the tier-0
deploy-less `eth_call` check passes.

**Rationale**: Every extra deployment carries the ≈ 13 tPOT contract charge and its own byte budget;
the tier-0 cost model is not yet confirmed, so the plan stays at one deployment and keeps
substitutability at source level, which is what Principle VII actually needs (the bond asset and the
identity link are the swappable parts). The tier-0 preflight recorded `eth_call` with creation data
returning empty data (`evidence/raw/g01/12-preflight-estimate.txt`), so the deploy-less lens is
**not** assumed; reads go through the contract's getters and the generic slot reader.

**Alternatives considered**: three contracts (registry/bond, challenge, payments) — rejected for
cost and because cross-contract fund conservation is harder to test; a deployed lens — rejected
until the deploy-less `eth_call` check has a recorded pass.

## D3 — Packed storage layout and slot budget

**Decision**: The measured layout in `contracts/storage-layout.md`:

- Config: slot 0 (`admin`, `challengeWindow`, `challengeBlockSize`, `slashBps`, `paused`) and slot 1
  (`minBond`, `nextDealId`, `providerCount`, `minDurationBlocks`, `maxDurationBlocks`).
- `providers`: array at slot 3; each element is exactly 32 bytes (`addr` 20, `bond` 8,
  `activeDeals` 3, `flags` 1). `providerIdOf` mapping at slot 2 → **2 slots per provider**.
- `deals`: mapping at slot 4; each `Deal` is 3 slots — slot A (`owner` 20, `startBlock` 4, `endBlock`
  4, `providerId` 2, `flags` 1), slot B (`root` 32), slot C (`leafCount` 3, `size` 4, `challengeIndex`
  4, `challengeStart` 4, `price` 8, `claimed` 8).
- A challenge writes only `challengeIndex`, `challengeStart` and one flag bit inside the deal's
  existing slot C and slot A → **0 new slots per challenge round**.

Amounts are `uint64` (cap ≈ 184,467 tPOT at 14 decimals, checked on every entry point), the provider
id is `uint16`, the leaf count is `uint24` (≤ 16,777,215 leaves ≈ 16 GiB at 1 KiB) and the byte size
is `uint32`.

**Rationale**: Packing is what keeps a deal at three slots and a provider at two, which are
published budgets. Storing a `providerId` instead of a 20-byte address is the single change that
makes the deal fit; the registry array is the same index the id refers to. `uint64` is enough for a
test-fund demo and the cap is validated and documented rather than silently truncating.

**Alternatives considered**: storing the provider address in the deal (needs a fourth slot);
storing `claimed` off-chain (rejected: money state must be on-chain); `uint96` amounts with a fourth
slot (over budget); deriving `leafCount` from `size` (rejected: the constitution requires the leaf
count committed in the deal, so it is stored explicitly).

**Evidence**: scratch `forge inspect Makhzan storage-layout` and a slot-probe test confirming the
provider element fits one slot and the deal fits three, with the fourth zero.

## D4 — Merkle scheme (normative in `contracts/merkle.md`)

**Decision**: Leaf hash is `keccak256(0x00 ‖ blockBytes)`. Node hash is
`keccak256(0x01 ‖ left ‖ right)`. Levels pair adjacent nodes left-to-right; when a level has an odd
number of nodes the last node is **carried upward unchanged** (promoted) and produces no path
element. Path directions come from the challenged index only: an even index means the running hash
is the left child, an odd index means it is the right child; after each step both the index and the
node count are halved using `(count + 1) / 2`. For a single-leaf deal the root **is** the leaf hash.
The expected number of path elements is derived on-chain from the committed leaf count and the
challenged index; a path of any other length is rejected. The expected byte length of the answer is
`challengeBlockSize` for every leaf except the last, and `size − (leafCount − 1) × challengeBlockSize`
for the last leaf; any other length is rejected.

**Rationale**: Each rule closes a specific forgery. Prefixes stop a leaf from being replayed as an
internal node. Deriving directions on-chain stops a prover choosing an order that fits a different
position. Deriving the expected length stops truncated and padded paths. Binding the answer's byte
length to a committed size and block size stops a provider from answering with an empty or oversized
payload. Explicit promotion makes non-power-of-two trees deterministic on both sides. Position
binding is then a fuzz property, not a hope.

**Alternatives considered**: sorted-pair hashing (breaks position binding and is harder to audit);
duplicating the last node instead of promoting it (creates the classic duplicate-node forgery);
accepting a precomputed leaf hash (violates Principle XV); an off-chain path-length check only
(rejected: the prover is untrusted).

## D5 — Challenge position selection and the reserve fallback

**Decision**: At challenge time the contract computes one seed from the parent block hash, the
current `prevrandao` and the deal id, takes `seed % leafCount`, and stores the result as
`challengeIndex`. The selector is a single internal function. If the randomness gate finds the
source constant, predictable or unreadable, the function is replaced by a commit-reveal path
(owner commits a hash, waits one block, reveals the preimage, index derived from the verified
preimage) and the change is recorded as a design change with its added latency and cost. The spec
stays neutral; this is the documented swap point.

**Rationale**: A provider must not know the position before it is fixed and must not be able to
influence it afterwards. The parent hash plus `prevrandao` is the cheapest on-chain source and is
already the subject of the tier-0 measurement; committing to it now while keeping one swap point is
honest and cheap.

**Alternatives considered**: committing to commit-reveal immediately (extra round trip and storage
before the gate has spoken); an oracle (new trust assumption and dependency, out of scope).

## D6 — Windows, durations and units

**Decision**: The response window is a deployment constant (default 50 blocks). Deal duration is
validated in blocks between `minDurationBlocks` (1 h ≈ 600 blocks) and `maxDurationBlocks`
(24 h ≈ 14,400 blocks). No wall-clock value is used in the contract for any deadline or payment.
A shorter window may be deployed for the timed demo; it changes no deal's semantics and is recorded
with the deployment parameters in the evidence.

**Rationale**: Block-count deadlines are the only deadlines a contract can enforce. Publishing the
window as a deployment constant keeps the 3-minute demo possible without weakening the default.

**Alternatives considered**: a per-deal window (more state, no benefit); wall-clock time (not
enforceable and manipulable).

## D7 — Payment arithmetic

**Decision**: The full price is escrowed at creation. Accrued payment is
`price × (min(block.number, endBlock) − startBlock) ÷ (endBlock − startBlock)`, computed in `uint256`
and cast back to `uint64`. `claim` pays `accrued − claimed` and only succeeds when that is non-zero.
`settle` runs only after `endBlock` with no open challenge, pays the provider `accrued − claimed`,
returns `price − accrued` to the owner, decrements the provider's open-deal count and sets the
settled flag. `price − accrued` is normally zero at expiry and exists for the boundary where a
settlement happens in the same block accounting rounds down.

**Rationale**: One formula, evaluated against an explicit "capped now" value, is the simplest thing
to test and the easiest for a reader to check. Floor rounding favours the escrow, never the payer
over the provider's accrued entitlement.

**Alternatives considered**: per-block rate stored instead of a total price (more rounding sites,
more state); paying the provider only at settlement (violates the clarified "claim any time").

## D8 — Slash arithmetic and payment safety

**Decision**: A failed resolution computes `slash = bond × 2000 ÷ 10000` (20%), clamps it to the
bond, decrements the bond, clears the open flag, emits the outcome, then transfers to the owner.
Transfers use a low-level call with the whole gas budget and revert on failure, after all state
changes (checks-effects-interactions). There is no reentrancy surface that can double-resolve
because the open flag is cleared before the transfer and a second resolve reverts on that flag.

**Rationale**: Keeping the slash inside the bond is an explicit invariant. Reverting on a failed
transfer means a contract owner that rejects funds cannot silently absorb the slash; the resolution
is retried instead.

**Alternatives considered**: pull payments with a credit ledger (extra per-owner state, larger code);
`transfer`/`send` with a 2,300-gas stipend (can break legitimate receivers).

## D9 — Access control

**Decision**: `challenge` and `settle` require the deal owner; `answer` requires the address stored
for the deal's provider id; `withdrawBond` requires zero open deals; `resolve` is permissionless
after the deadline (the outcome is deterministic and the slash goes to the owner), so a stalled
owner cannot leave a failed challenge unresolved. `claim` is permissionless (payment goes to the
provider's stored address).

**Rationale**: The spec makes the owner the only challenger and the provider the only answerer, and
those two are enforced directly. Making `resolve` and `claim` permissionless adds liveness without
adding authority, because neither can redirect funds.

**Alternatives considered**: owner-only resolve (a stalled owner freezes the slash); anyone-can-answer
(rejected by scope).

## D10 — Evidence pipeline and finality

**Decision**: One `status.ts` pipeline produces, per transaction: `submitted`
(hash, nonce, raw), `included` (block number, block hash), `executed` (receipt status), `finalized`
(block tag `finalized` when the RPC supports it, otherwise N confirmations labelled
`heuristic(confirmations=N)`), and `readBack` (a named view call with its result). Records are
written by the tier-0 evidence writer (`apps/gates/src/lib/evidence.ts`) through a thin tier-1
wrapper, which sanitises for secrets and writes atomically. A component refuses to act on anything
earlier than `executed`, and refuses to report `finalized` unless it observed it.

**Rationale**: The five states are a spec requirement and an honesty requirement. Reusing the
tier-0 writer keeps one sanitiser and one atomic-write implementation in the repository.

**Alternatives considered**: a second evidence implementation (two sanitisers, two formats);
`viem`'s `waitForTransactionReceipt` alone (no finality concept).

## D11 — TypeScript stack and reuse

**Decision**: `apps/makhzan/` on Node `24.20.0` with native type stripping, `viem 2.57.7` (same exact
pin as `apps/gates`), `typescript` and `@types/node` as dev dependencies, `node:test` for tests, and
`node:util`'s `parseArgs` for CLI parsing. Tier-0 helpers are imported by relative path
(`../../gates/src/lib/evidence.ts`, `../../gates/src/lib/evm.ts`) rather than copied. Local state is
one JSON file under a gitignored `.state/` directory, written atomically.

**Rationale**: No new library is added; the only duplication is a second `node_modules` tree with
the identical `viem` version, which is disclosed. Reusing the tier-0 helpers keeps the argv secret
guard, the chain definition and the evidence sanitiser single-sourced.

**Alternatives considered**: npm/yarn workspaces at the repo root (restructures tier 0, out of
scope); copying helper code (two sources of truth for the secret guard); a database (forbidden).

## D12 — Challenge discovery by polling state

**Decision**: The daemon knows the deal ids it has been told about (from the client envelope and its
local JSON state) and, each cycle, polls the contract's deal getter plus the provider's open-deal
count. It never calls `eth_getLogs` over a historical range and never treats a log query as the way
to find an open challenge. If an owner opens a challenge on a deal the daemon has never heard of,
the daemon reports it as unanswerable rather than silently missing it.

**Rationale**: The public RPC prunes state and log ranges (tier-0 decision DR-001 recorded a 2,000
block lookback failing). Polling current state is reproducible and immune to pruning.

**Alternatives considered**: log-based discovery (brittle on a pruned public endpoint); an indexer
(out of scope).

## D13 — Continuous integration

**Decision**: One workflow with two jobs. Contracts job: `forge fmt --check`, `forge build --sizes`,
`node scripts/check-size.mjs`, `forge test -vvv`, `forge snapshot --check`. TypeScript job:
`npm ci`, `npm run typecheck`, `npm test`, and `node packages/merkle-vectors/generate.ts --check` to
prove the committed vectors still match the generator. Both jobs run on every push to the feature
branch and on pull requests.

**Rationale**: The size budget, the shared vectors and the gas snapshot are the three regressions
that are invisible in a normal unit-test run, so each gets an explicit check.

**Alternatives considered**: separate workflows (more files, no benefit); skipping the snapshot
check in CI (drift becomes invisible).

## D14 — Size-budget check

**Decision**: `contracts/size-budget.json` holds the runtime byte budget and the per-record slot
budgets. `scripts/check-size.mjs` reads
`contracts/out/Makhzan.sol/Makhzan.json`, measures the deployed bytecode length, compares it with
the budget and exits non-zero with the actual and budgeted numbers. Slot budgets are asserted by
`contracts/test/makhzan/StorageLayout.t.sol` reading specific slots of a populated deal.

**Rationale**: A machine-checked budget is the only thing that stops a size regression from being
noticed after the fact; putting the number in one JSON file means CI and the plan cannot disagree.

**Alternatives considered**: parsing `forge build --sizes` text (locale/format fragility); a shell
`wc -c` on the artifact (same idea, less readable output).

## D15 — Shared golden vectors

**Decision**: `packages/merkle-vectors/generate.ts` writes `vectors.json` for leaf counts 1, 3, 7 and
1000 with deterministic leaf data, each vector carrying the leaves, the root and every path. The
TypeScript test re-derives roots and paths and compares. `contracts/test/makhzan/GoldenVectors.t.sol`
reads the same file with `vm.readFile` + `vm.parseJson` and verifies each path on-chain. Both
`generate.ts --check` and the two test suites run in CI.

**Rationale**: The two implementations must agree by construction, and a file both can read is the
only way to prove it in both directions. A 1000-leaf case exercises promotion at several levels.

**Alternatives considered**: hard-coded vectors in each language (drift impossible to detect);
property-based cross-checking without a fixture (harder to attribute a failure).

## D16 — Live transaction policy

**Decision**: Every live transaction uses `gas = estimateGas × 1.2`, `maxFeePerGas = current chain
gas price`, `maxPriorityFeePerGas = 0`. Deployment and calls go through `script/makhzan/Deploy.s.sol`
and the CLI/daemon, all signing in-process with `viem` from environment variables. Receipts and
errors are written verbatim. A gas-price spike aborts the run rather than overpaying.

**Rationale**: The chain's fee market is not assumed to be Ethereum-shaped. A 20% margin over the
estimate is the smallest margin that tolerates small state changes between estimate and inclusion.

**Alternatives considered**: EIP-1559 defaults with a tip (unnecessary cost); `cast send` (key on
argv, forbidden).

## D17 — Dependencies, versions, licences

| Component | Version | Licence | Why |
| --- | --- | --- | --- |
| Foundry (`forge`, `cast`, `anvil`) | 1.8.5 | MIT / Apache-2.0 | compile, test, snapshot, local chain |
| forge-std | 1.17.0 | MIT | test helpers only (tests are not deployed) |
| viem | 2.57.7 | MIT | RPC, signing, keccak in the daemon and CLI (same pin as tier 0) |
| TypeScript | 5.9.3 | Apache-2.0 | dev-only type checking |
| @types/node | 24.19.2 | MIT | dev-only types |
| Node.js | 24.20.0 | MIT | runtime for the daemon and CLI |

No dependency is added for HTTP, WebSocket, argument parsing, testing or hashing: Node's built-in
`fetch`, `WebSocket`, `parseArgs`, `node:test` and `node:crypto`, plus `viem`'s keccak, cover them.
No OpenZeppelin contract is imported, so no third-party Solidity code is deployed.

## D18 — Environment note: the worktree's empty submodule

**Decision**: The first setup task runs `git submodule update --init --recursive` inside the tier-1
worktree and records the command and output under `evidence/raw/t1/`. The `forge-std` submodule is
not committed; only the `.gitmodules` pointer already in the repository is used.

**Rationale**: A `git worktree` does not populate submodules, and `forge test` cannot compile
without `forge-std`. Without this recorded step, "clone and run the tests" silently fails for the
next person.

**Alternatives considered**: vendoring `forge-std` (duplicates a third-party tree in the repo);
remapping tests to the main worktree's copy (fragile and not reproducible).

## D19 — Deploy-less lens decision point

**Decision**: The optional never-deployed lens is **not** built now. The tier-0 preflight recorded
`eth_call` with creation data returning empty data
(`evidence/raw/g01/12-preflight-estimate.txt`). A lens is added only after a recorded deploy-less
`eth_call` check passes on the live chain, and it is a separate `[LIVE]`-gated task if it happens.

**Rationale**: Reads are already covered by the contract's getters and `peek`, and a failed
deploy-less `eth_call` would make the lens unbuildable on the target chain. Building it speculatively
would be work on an unproven capability.

**Alternatives considered**: building the lens anyway (violates "reality over spec"); reading via
`eth_getStorageAt` only (no decoded structures for the CLI).

## D20 — Block size decision point (G04)

**Decision**: The contract reads `challengeBlockSize` from a deployment parameter and the shared
vectors are generated for the agreed size. The default is 1 KiB. When G04 fixes the size, the
deployment parameter, the vectors and the CLI chunk size change together, in one recorded commit,
and the golden-vector check in CI proves the two sides still agree.

**Rationale**: The spec's default is 1 KiB until the gas gate speaks, and the size is a single
constant in three places; treating it as a deployment parameter keeps the change mechanical.

**Alternatives considered**: a per-deal block size (more state, breaks the shared-vector story);
hard-coding 1 KiB and ignoring G04 (violates the gate's purpose).

## D21 — Cost model re-set (G05)

**Decision**: The budget numbers in the plan are estimates built from the reported chain numbers
(0.079 tPOT per deployed byte, 13 tPOT per contract, 3.9 tPOT per slot, slots refunded when cleared).
On the storage-cost gate verdict they are replaced by the measured numbers, the budget table in this
plan and in `contracts/budget.md` is regenerated, and the change is recorded in `docs/decisions.md`.

**Rationale**: A budget that is not re-set from measurement is a claim, not a budget. The plan keeps
every number labelled "estimate" until then.

**Alternatives considered**: waiting for G05 before writing any budget (blocks the plan); treating
the reported numbers as measured (violates Principle V).
