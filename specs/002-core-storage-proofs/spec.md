# Feature Specification: Core Storage Proofs

**Feature Branch**: `002-core-storage-proofs`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Feature 002-core-storage-proofs (Tier 1, the Oct 24 check-in slice). What: a minimal accountable storage protocol on Portaldot's EVM. A provider bonds tPOT. A client creates a deal for a file (Merkle root, leaf count, size, duration, price, escrowed deposit). The deal owner challenges the provider for a randomly chosen block of the file; the provider answers with the block's bytes plus the Merkle path; the contract verifies them against the deal root at the challenged position. A valid answer passes. A wrong answer, or no answer inside the response window, slashes the provider. A provider daemon answers challenges; a client CLI chunks a file, builds the root, creates the deal and uploads to the provider. Why: it is the core of the project and the check-in deliverable. It proves bonded, challenged storage runs on Portaldot with on-chain, verifiable results."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A provider bonds and serves a deal (Priority: P1)

A storage provider registers once by locking a bond in the chain's native test currency. A client can then open a storage deal against that provider for a file the provider has acknowledged receiving. The provider keeps the file and can answer retrieval challenges for the duration of the deal, while the client's payment sits in escrow and is released to the provider as the deal runs.

**Why this priority**: Without a bond there is nothing to slash, and without a served deal there is nothing to challenge. This is the economic foundation of the protocol and the first half of the check-in demo.

**Independent Test**: On a local chain, register a provider with a bond, upload a file to the provider, create a deal whose price is escrowed, read the provider, bond, deal and escrow state back, and confirm that the provider can produce the challenged block and path for a position chosen by the tester.

**Acceptance Scenarios**:

1. **Given** a fresh deployment and an account with native test funds, **When** the account registers as a provider with at least the minimum bond, **Then** the bond is held by the protocol, the provider is listed as available, and the registration is readable afterwards.
2. **Given** a registered provider, **When** the client uploads a file and opens a deal with a root, leaf count, byte size, duration and price, **Then** the price is escrowed, the deal names the provider and owner, and no second deal can reuse the same identifier.
3. **Given** an open deal, **When** the provider produces the block at a requested position plus its authentication path, **Then** the produced bytes and path verify against the deal's committed root at that position.
4. **Given** a provider with an open deal or an unresolved challenge, **When** the provider tries to withdraw the bond, **Then** the withdrawal is refused.

---

### User Story 2 - A client stores a file and sees it challenged (Priority: P2)

A client takes a real file, splits it into fixed-size blocks, builds a single commitment over all blocks, uploads the file to the provider, and opens a deal. Later the client challenges one randomly selected block. The provider answers with the block's bytes and the path that binds them to the commitment, and the protocol decides whether the answer is acceptable without trusting either party.

**Why this priority**: This is the verifiable-storage behaviour the project exists to demonstrate. It depends on Story 1 but is the reason the bond exists, so it must be testable as soon as a provider can serve.

**Independent Test**: With a provider and an uploaded file, open a deal, challenge a position, submit a correct answer and confirm a pass with no bond change; then challenge again, submit no valid answer, let the response window expire, resolve, and confirm the provider's bond decreased by the configured share and the owner received it.

**Acceptance Scenarios**:

1. **Given** an open deal, **When** the deal owner challenges it, **Then** exactly one block position is selected unpredictably, recorded, and given a response deadline in blocks.
2. **Given** an open challenge, **When** the provider submits the correct bytes and path before the deadline, **Then** the challenge is recorded as passed, the bond is unchanged, and the deal continues.
3. **Given** an open challenge, **When** the provider submits only a hash, empty bytes, the wrong bytes, a path for another position, or a path of the wrong depth, **Then** the answer is rejected and no challenge passes.
4. **Given** an open challenge with no accepted answer, **When** the owner resolves after the deadline, **Then** the challenge is recorded as failed and a slash is paid to the owner.
5. **Given** a challenge that has already resolved, **When** anyone tries to resolve it again, **Then** the attempt is refused and no second slash occurs.
6. **Given** a deal whose duration has ended, **When** the owner settles it, **Then** the provider receives all unpaid accrued payment, the owner receives any unaccrued remainder, and the deal can never be settled or challenged again.

---

### User Story 3 - Anyone can see one passed and one slashed challenge with transaction hashes (Priority: P3)

An observer who trusts neither the provider nor the client can look at the public record and check two outcomes: a challenge that passed because the provider produced verifiable bytes, and a challenge that failed because the provider did not. Each outcome is tied to transaction references and to state read back from the chain, not to a screenshot or a claim.

**Why this priority**: The check-in deliverable is evidence of accountable behaviour. A working protocol that cannot show its outcomes is not yet demonstrable to a judge or a user.

**Independent Test**: Follow a recorded demo from its transaction references alone and confirm that one challenge shows a passed outcome with an unchanged bond, one shows a failed outcome with a reduced bond and a matching owner credit, and both are visible in state read back after the transactions are final.

**Acceptance Scenarios**:

1. **Given** a completed challenge round, **When** an observer reads the deal and provider state, **Then** the outcome, the challenged position, the resolution block and the bond before and after are readable.
2. **Given** the two required demo rounds, **When** the evidence bundle is opened, **Then** each round carries the submitted transaction, the inclusion block, the execution result, the finality observation and a state read-back.
3. **Given** a transaction that is only submitted or only included, **When** an off-chain component reports on it, **Then** the report labels it as not final and no irreversible local decision has been taken from it.

---

### Edge Cases

- The provider never acknowledges the upload: the client does not challenge and does not treat the deal as served; a deal for unacknowledged data is not created, or is abandoned before any challenge.
- The provider answers after the response deadline: the answer is rejected; the owner resolves as failed after the deadline.
- The provider answers with the correct block but a path for a different position: the answer is rejected because directions are derived from the challenged position, not from the proof.
- The provider answers with the correct bytes but the wrong number of path elements (too short or too long): the answer is rejected because the expected depth is derived from the committed leaf count and the challenged position.
- The tree has a non-power-of-two number of leaves: the odd node at each level is carried upward explicitly, and the expected path length accounts for the carried level.
- The file is smaller than one challenge block: the deal has one leaf whose length equals the file size, and a block other than the last has a fixed expected length.
- The challenged position is the last leaf and the file is not an exact multiple of the block size: the expected byte length is the remainder, and any other length is rejected.
- The deal expires while a challenge is open: the open challenge still resolves normally; no new challenge can be opened after expiry.
- A provider's bond falls below the minimum after slashing: the provider keeps its existing deal but cannot register a new one until it tops up.
- A claim is attempted before any payment has accrued or after the deal has ended: a zero claim is refused; the final accrued amount is payable up to settlement.
- Settlement is attempted before expiry, twice, or while a challenge is open: each attempt is refused.
- The owner challenges with a position that fails to be unpredictable (for example the selection value is constant or readable in advance): the selection rule is replaced by a documented fallback before any live evidence is claimed.
- The RPC is unavailable during a live run: the exact error and UTC time are recorded, work continues locally, and the live result is not reported as passed.
- The deployed code exceeds the size budget, or a record exceeds its slot budget: the build fails the budget check and the overrun is either fixed or justified in writing before merge.

## Requirements *(mandatory)*

### Functional Requirements

**Bond and provider lifecycle**

- **FR-001**: The protocol MUST let an account register as a storage provider by locking a bond paid in the chain's native test currency through the value attached to the registration call. The bond MUST be held by the protocol, not by an external token contract.
- **FR-002**: The protocol MUST enforce a minimum bond of 10 tPOT for registration. A provider MAY add to its bond at any time, and the added value MUST be reflected in the bond read back.
- **FR-003**: The protocol MUST refuse bond withdrawal while the provider has an open deal or an unresolved challenge. Withdrawal of the full bond MUST leave the provider unregistered.
- **FR-004**: A provider whose bond is below the minimum after a slash MUST be refused new deals until the bond is topped up, while existing deals and challenges continue to be honoured.

**Deal creation and escrow**

- **FR-005**: A client MUST be able to open a storage deal against a registered provider by committing the file's Merkle root, leaf count, byte size, start and end blocks, total price and the challenge block size used to build the tree. The total price MUST be escrowed with the deal in native test currency.
- **FR-006**: The protocol MUST validate a new deal before accepting value: the provider must be registered and above the minimum bond, the duration must be between 1 and 24 hours in blocks, the price must be positive and representable, the byte size must be positive, the leaf count must be exactly the number of challenge blocks implied by the size and block size, the block size must be within the permitted range, and the root must not be zero.
- **FR-007**: The protocol MUST assign each deal a unique identifier and MUST refuse a second creation for the same identifier. Each deal MUST record its owner, provider, root, leaf count, byte size, start block, end block, price, amount claimed and challenge state.
- **FR-008**: The challenge block size MUST be a protocol constant chosen from the measured range of 1–4 KiB, defaulting to 1 KiB until the gas gate fixes it. It MUST be independent of how the client chunks data for transport.
- **FR-009**: The client MUST obtain the provider's acknowledgement that the complete file for a root has been received before the client issues any challenge for that deal.

**Challenge, answer and resolution**

- **FR-010**: Only the deal owner MAY open a challenge for an active deal. A deal MUST have at most one open challenge at a time, and a challenge round MUST target exactly one block position.
- **FR-011**: The challenge position MUST be selected unpredictably from the committed leaf count at challenge time, recorded on-chain, and MUST NOT be supplied or altered by the provider when answering.
- **FR-012**: A challenge MUST carry a response deadline of 50 blocks from the block in which it is opened. Deadlines MUST be expressed in block numbers, never wall-clock time.
- **FR-013**: The provider named in the deal, and only that provider, MUST be able to answer before the deadline with the challenged block's bytes and the Merkle path for the challenged position.
- **FR-014**: The verifier MUST use domain-separated hashing: a distinct prefix for leaves and a distinct prefix for internal nodes. A leaf MUST be hashed from the supplied bytes, never accepted as a precomputed hash. A response that carries only a hash, carries empty bytes, or carries bytes of the wrong length MUST be rejected.
- **FR-015**: The verifier MUST derive every path direction from the challenged position and the committed leaf count. Path directions MUST NOT be accepted from the prover. The expected path length MUST be derived from the same two values, and a path that is too short or too long MUST be rejected.
- **FR-016**: The verifier MUST handle non-power-of-two leaf counts explicitly by carrying an unpaired node upward, and the expected path length MUST reflect the carried level.
- **FR-017**: The verifier MUST bind the proof to the challenged position: a proof that is valid for position `i` MUST NOT verify for any other position `j`, whether the attacker changes the index, the bytes or the path ordering.
- **FR-018**: A correct answer before the deadline MUST close the challenge as passed, MUST leave the bond unchanged, and MUST leave the deal active until its end block.
- **FR-019**: An incorrect answer MUST be rejected without closing the challenge and without moving value. The provider MAY retry with a correct answer until the deadline.
- **FR-020**: After the deadline, if the challenge has not passed, the owner MUST be able to resolve it as failed. A failed resolution MUST slash exactly 20% of the provider's bond at that moment and pay it to the deal owner.
- **FR-021**: A slash MUST never exceed the provider's bond. If the computed share exceeds the bond, the bond itself is the ceiling.
- **FR-022**: A challenge MUST resolve at most once. A second resolution attempt MUST be refused with no additional transfer.
- **FR-023**: No challenge may be opened after the deal's end block. An already-open challenge MUST still be resolvable after the end block.

**Payment and settlement**

- **FR-024**: Payment MUST accrue linearly per block between the deal's start and end blocks, capped at the total price. The provider MUST be able to claim accrued-but-unclaimed payment at any time while the deal exists.
- **FR-025**: Accrued payment MUST never exceed the deal's escrowed deposit, and cumulative claimed payment MUST never exceed accrued payment.
- **FR-026**: After the end block and with no open challenge, the deal owner MUST be able to settle the deal. Settlement MUST pay the provider all unpaid accrued payment, return any unaccrued remainder to the owner, close the deal and allow the provider's deal count to fall.
- **FR-027**: Settlement MUST happen at most once and MUST be refused before the end block or while a challenge is open.
- **FR-028**: The protocol's balance MUST at all times be at least the sum of provider bonds, remaining escrow and any unclaimed payouts recorded by the protocol.

**Off-chain components and status honesty**

- **FR-029**: A provider daemon MUST persist acknowledged files, detect open challenges by polling contract state, produce the challenged block and path, submit the answer, and record the result. It MUST NOT depend on a historical log query to discover challenges.
- **FR-030**: A client command-line tool MUST chunk a file into challenge blocks, build the root and paths, upload the file to the provider, wait for acknowledgement, create the deal with escrow, and later open challenges.
- **FR-031**: Every off-chain report MUST distinguish five states for a transaction or observation: submitted, included, executed successfully, finalized, and state read back. A component MUST NOT take an irreversible local decision from an observation that is not final.
- **FR-032**: The daemon and client MUST keep local state in a plain JSON file and MUST be able to recover from a restart without a database.
- **FR-033**: Every challenge outcome recorded as evidence MUST carry the submitted transaction reference, inclusion block, execution result, finality observation and a post-state read-back. A finality method that is only a confirmation heuristic MUST be labelled as such.

**Evidence, budgets and disclosures**

- **FR-034**: The feature MUST produce local evidence of one passed challenge and one failed-and-slashed challenge, with transaction references and state read-backs, before any live run is attempted.
- **FR-035**: The feature MUST produce live evidence of one passed challenge and one failed-and-slashed challenge on the target test network. This acceptance item is BLOCKED until the Tier 0 gates that establish deployment, compiler, block size and storage cost pass and the owner account is funded; until then the item MUST be reported as blocked, never as done.
- **FR-036**: The deployed runtime code MUST NOT exceed 10 KB, a deal record MUST NOT occupy more than 3 storage slots, a provider record MUST NOT occupy more than 2 storage slots, an active challenge MUST NOT add more than 1 reused storage slot, and a challenge round MUST NOT grow storage. These budgets are re-set from the storage-cost gate, and any overrun MUST carry a written justification in the implementation plan before merge.
- **FR-037**: The feature MUST record, per operation, the deployed bytes, the storage slots consumed and the native test currency attributable to code deposit and storage deposit, and MUST keep those numbers in a budget table.
- **FR-038**: A continuous-integration check MUST fail the build when the deployed runtime size exceeds the budget, and the same job MUST run formatting, on-chain build, on-chain tests, off-chain type checking and off-chain tests.
- **FR-039**: The off-chain and on-chain Merkle implementations MUST agree on a set of shared golden vectors covering a single leaf, an odd leaf count and a larger non-power-of-two tree, including roots and every path.
- **FR-040**: The feature MUST include fuzzed verification for correct proofs, wrong positions, wrong bytes, wrong path depth and swapped path elements. A fuzz campaign MUST NOT accept a proof it should reject.
- **FR-041**: The feature MUST enforce and test these invariants: (1) the protocol balance is at least the sum of bonds, escrowed deposits and unclaimed payouts; (2) a slash never exceeds the bond; (3) a challenge resolves at most once; (4) accrued payments never exceed the deposit; (8) a valid proof for position `i` never verifies for position `j`.
- **FR-042**: The README MUST carry an implemented / simulated / roadmap table whose rows match the evidence, an architecture diagram, the AI-assistance marking, the dependency and licence disclosure, and a demo script that runs in at most 3 minutes.
- **FR-043**: The protocol MUST validate all external input before use: provider and deal identifiers, byte lengths, path lengths, durations, prices and file metadata. Validation MUST reject unexpected sizes and values rather than coercing them.
- **FR-044**: The core storage, challenge and payment logic MUST sit behind a stable protocol interface, with the bond asset and the future identity link isolated so either can be replaced without rewriting the core.
- **FR-045**: Every short custom error MUST be mapped to a human-readable message by the off-chain components, and no error path may silently succeed.

### Cost and Footprint Constraints

| Constraint | Budget | Re-set by |
| --- | --- | --- |
| Deployed runtime code | ≤ 10 KB | Storage-cost gate |
| Storage slots per deal | ≤ 3 | Storage-cost gate |
| Storage slots per provider | ≤ 2 | Storage-cost gate |
| Active challenge storage | ≤ 1 reused slot | Storage-cost gate |
| Storage growth per challenge round | 0 slots | Storage-cost gate |
| Native currency per operation | recorded, not yet capped | Storage-cost and challenge-cost gates |

The reported chain behaviour — roughly 0.079 tPOT per deployed byte, 13 tPOT per contract and 3.9 tPOT per new storage slot, with slots refunded when cleared — is a planning estimate only. The storage-cost gate MUST confirm it, and the budgets above MUST be re-set from the confirmed numbers.

### Key Entities *(include if feature involves data)*

- **Provider**: An account that has locked a bond and can be named by deals. Key attributes: address, bond, open deal count, registration state. A provider is unavailable for new deals while its bond is below the minimum.
- **Deal**: An agreement to store one file for a bounded duration. Key attributes: identifier, owner, provider, Merkle root, leaf count, byte size, start block, end block, total price, amount claimed, challenge state, settlement state.
- **Challenge**: A request to prove possession of one block of a deal. Key attributes: deal identifier, challenged position, open block, response deadline, outcome. A deal has at most one open challenge and a challenge resolves once.
- **Proof**: The challenged block's bytes plus the authentication path that binds them to the deal root at the challenged position. It is accepted or rejected by on-chain rules alone.
- **Escrow**: The native currency deposited with a deal, released to the provider as payment accrues and returned to the owner only as an unaccrued remainder.
- **Bond**: The native currency locked by a provider, slashable for a failed challenge and withdrawable only when no deal or challenge is open.
- **Evidence Record**: One reproducible observation of an operation, carrying the command or transaction reference, the five-state status, the finality observation and a state read-back.
- **Budget Entry**: One line of the cost table: operation, deployed bytes, storage slots, native currency attributable to deposit and the gate that confirmed the numbers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a local chain, a 1 MiB file is uploaded, a deal is opened with escrow, and a challenge is answered correctly end to end, with the passed outcome and unchanged bond read back from state.
- **SC-002**: On the same local run, a second challenge receives no valid answer, is resolved after the response window, and the provider's bond is lower by exactly 20% of its pre-resolution value while the owner's balance is higher by the same amount.
- **SC-003**: The Merkle verifier is fuzzed with at least 1,000 cases per property over positions, leaf bytes, path depth and path ordering, with zero false accepts and zero false rejects.
- **SC-004**: The invariant suite runs at least 256 sequences of at least 50 calls each with zero violations of the five required invariants.
- **SC-005**: Shared golden vectors for leaf counts 1, 3 and 7 produce byte-identical roots and paths in the contract-side and off-chain implementations.
- **SC-006**: The size check fails when the runtime is one byte over the 10 KB budget and passes when it is at or below it; the deals, provider and challenge slot budgets are asserted by a test.
- **SC-007**: After the Tier 0 gate and funding gate pass, one live passed challenge and one live slashed challenge are recorded with transaction references, inclusion blocks, execution results, finality observations and state read-backs.
- **SC-008**: The recorded demo completes in at most 3 minutes and follows the README script without undocumented steps.
- **SC-009**: The README's implemented / simulated / roadmap table, architecture diagram and dependency disclosure are consistent with the committed evidence, with every implemented row backed by a test or a transaction reference.
- **SC-010**: Zero private keys, API keys or environment values appear in the repository, logs, evidence or checkpoint bundle.

## Assumptions

- The chain's native test currency is tPOT with the decimal relationship established by the funding gate; amounts in this feature are expressed in the chain's smallest unit internally.
- Block time is about 6 seconds, so 50 blocks is about 5 minutes and a 1–24 hour deal is about 600–14,400 blocks. Deadlines and durations are stored as block counts, never wall-clock timestamps.
- The default challenge block size is 1 KiB and the permitted range is 1–4 KiB. The gas gate may fix a different size in that range; the protocol's declared size changes with it and the golden vectors are regenerated.
- The default deal duration range is 1–24 hours, the default slash is 20% of the bond per failed challenge, the default response window is 50 blocks and the default minimum bond is 10 tPOT. These defaults are confirmed during clarification and may be re-set by a recorded decision.
- The deal owner is the only challenger in this tier; permissionless challenging and challenger bonds are out of scope.
- One challenge targets one block, and the default demo file is 1 MiB.
- Payments accrue linearly per block. The provider may claim at any time; the owner settles after expiry and receives the unaccrued remainder.
- The provider must acknowledge the complete upload before a challenge is issued; acknowledgement is an off-chain signal and the on-chain protocol does not store the file.
- The Tier 0 gates for deployment, compiler path, block size and storage cost are prerequisites for live evidence, not for local development. The owner account must be funded before the live phase.
- Local development and all local evidence use a local chain first. The target test network is used only in the final, explicitly gated phase.
- The protocol is a single deployable component behind a stable interface, with internal source-level modules for Merkle verification, bond accounting and payments.
- The numbers reported for code and slot deposits are planning estimates until the storage-cost gate confirms them; no budget is presented as measured before that gate has a verdict.
- The demo is run by one operator on one machine; no multi-tenant hosting, database or user interface is assumed.

## Out of Scope

- Replication, erasure coding and repair.
- Permissionless challenges and challenger bonds.
- The vault, the agent, identity, user interfaces and any ERC-20 token.
- Multi-chain support, WASM/ink! contracts and mainnet deployment.
- Early termination, deal transfer, partial-file deals and provider reputation scoring.
