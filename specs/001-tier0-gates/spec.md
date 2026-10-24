# Feature Specification: Tier 0 Chain Gates

**Feature Branch**: `001-tier0-gates`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Feature: 001-tier0-gates. Goal: establish, with evidence, which assumptions Makhzan can rely on at the Portaldot V3 testnet before any product code exists."

## Clarifications

### Session 2026-10-20

- Q: How is the final challenge block size chosen within the 1–4 KiB target? → A: The gas gate decides: use the largest size in that range that fits the measured payload and cost limits with a stated margin.
- Q: How long does network monitoring keep running? → A: It starts before the first gate, runs through the whole gate window, and is left running after the gates finish; gaps are reported, never backfilled.
- Q: What counts as a hard deployment failure that stops the tier? → A: No successful deployment after two serious attempts with different toolchain paths within 48 hours; individual failed attempts are recorded and retried.
- Q: Where do pass, partial and fail sit for a gate? → A: Pass means every required measurement was obtained and the assumption holds; partial means it holds only with caveats or some required measurement could not be obtained; fail means the assumption is disproved.
- Q: How are other teams' reported deposit and gas numbers treated? → A: As `[reported]` until our own measurement confirms or corrects them. Live deployment is capped: at most three small size probes, and no single probe may spend more than 5% of the owner balance.
- Q: How is the code-size limit established without deploying a ladder of large contracts? → A: Read the limit from runtime metadata and constants. Extend the ladder only with `eth_estimateGas` dry runs, and only when the owner balance covers the implied deposit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know whether value can move and state can persist on the target chain (Priority: P1)

The owner needs a small, disposable contract deployed to the live test network and then called in several ways, so that the single assumption everything else depends on — that code can be deployed, state can be changed, events can be emitted, reverts behave, value can be sent, and time/block numbers are readable — is either confirmed with a transaction hash or disproved with a verbatim error.

**Why this priority**: If this fails, there is no product. Every later gate is meaningless until a contract exists on-chain and behaves predictably. It is also the gate that can force a fallback, so it must run early and be reported honestly.

**Independent Test**: Deploy the disposable contract, exercise each behavior, and confirm that an independent reader can find each result from the recorded transaction reference and re-run the same steps from the documentation.

**Acceptance Scenarios**:

1. **Given** an account with test funds, **When** the disposable contract is deployed to the live network, **Then** a deployment transaction reference is recorded and the contract responds to a read call.
2. **Given** a deployed contract, **When** each behavior (state write, event, revert, value transfer, current time, current block number) is exercised, **Then** the observed result is compared to expected Ethereum behavior and every difference is listed.
3. **Given** an environment where deployment succeeds, **When** the exact tooling and settings that worked are recorded, **Then** a second person can repeat the deployment using only that record.

---

### User Story 2 - Know whether a proof that carries real data bytes fits in a transaction (Priority: P2)

The owner needs measured limits on payload size and verification cost, because the design's core rule is that a challenge response includes the challenged bytes rather than only hashes. A proof that cannot be submitted within transaction and cost limits makes the product impossible as designed.

**Why this priority**: This is the second hard dependency. If the smallest viable proof cannot be verified within limits, the whole verification model changes, so this must be measured rather than assumed.

**Independent Test**: Submit payloads and proofs of increasing size to the live network and confirm that each measurement is reproducible from the recorded command and transaction reference, and that the recommended challenge block size follows arithmetically from the measurements.

**Acceptance Scenarios**:

1. **Given** a deployed measuring contract, **When** payloads of 1, 4, 16 and 64 KiB are hashed, **Then** the cost of each is recorded and shows how hashing cost scales.
2. **Given** a deployed verification contract, **When** full Merkle verification runs for a 1 KiB and a 4 KiB leaf block at depths 10, 14 and 20, **Then** the cost of each combination is recorded.
3. **Given** measured transaction payload limits and verification costs, **When** the largest response that still fits is computed, **Then** a challenge block size in the 1–4 KiB target range is recommended with the arithmetic shown.

---

### User Story 3 - Know whether the economics and supply of test funds survive 14 days of operation (Priority: P3)

The owner needs to know what a challenge round costs and how much test currency is needed to keep three providers under challenge for 14 days, and needs the accounts funded so later tiers are not blocked by a dry faucet.

**Why this priority**: Economics decide whether the demo can run continuously. Funding also unblocks all later work, and the faucet may not be repeatable, so it must be secured early.

**Independent Test**: Confirm each funded account's balance and the recorded mapping between native and contract-visible addresses, then compute the 14-day requirement from measured per-round costs and compare it with the funds actually available.

**Acceptance Scenarios**:

1. **Given** the faucet pays native addresses, **When** six accounts are funded, **Then** each account's funded balance is recorded and the contract-visible balance of the same account is recorded alongside it.
2. **Given** funded accounts, **When** a value transfer is made between a native-funded account and its contract-visible address, **Then** the relationship between the two representations and the effect of the token's decimal places are documented with transaction references.
3. **Given** measured costs for issuing, answering and resolving a challenge, **When** the 14-day requirement is computed for three providers at 10, 20 and 30 minute intervals, **Then** each scenario is stated in test currency and compared with the total funded balance.
4. **Given** a realistic deal record, **When** it is stored, **Then** the deposit for the record and the marginal cost of one more stored value are recorded.

---

### User Story 4 - Know whether challenge selection can be unpredictable and whether optional chain services exist (Priority: P4)

The owner needs to know whether on-chain randomness is usable for selecting challenge blocks, and whether identity and asset services are available, because an accountable agent and a swappable bond asset depend on them.

**Why this priority**: Randomness affects the security story of every challenge. Identity and assets affect two swappable modules. All three are cheaper to substitute now than after product code exists.

**Independent Test**: Sample at least 30 consecutive blocks by read call and at least 10 values from real transactions, confirm whether the sets agree and whether the previous block's value is readable; query identity and asset services and record their responses verbatim.

**Acceptance Scenarios**:

1. **Given** 30 or more consecutive blocks and at least 10 real transactions, **When** the randomness values and previous-block references are sampled both ways, **Then** both sets are recorded, any disagreement is reported, and a verdict on usability for challenge selection is stated, with a commit-reveal alternative if unusable.
2. **Given** a funded provider account, **When** an identity is set and read back, **Then** the outcome is recorded as supported or unsupported.
3. **Given** the optional asset service, **When** standard token calls are made, **Then** the responses are recorded and the gate is reported as optional rather than failed if the service is absent.

---

### User Story 5 - Know the state of the network over time and get a written decision record (Priority: P5)

The owner needs continuous evidence of whether the network was reachable while the gates ran, and a single written record that classifies every non-passing gate, so later design work is based on facts and not on optimistic memory.

**Why this priority**: Intermittent failures are indistinguishable from mistakes without a log, and an unclassified failure silently becomes an excuse. The decision record is what later tiers are built against.

**Independent Test**: Confirm that probe entries exist for the whole measurement window at the stated cadence, and that every gate has a verdict, evidence reference and, where not passing, a classification and a concrete adaptation.

**Acceptance Scenarios**:

1. **Given** the probe is started before any other gate, **When** the measurement window closes, **Then** daily logs exist covering the window and show reachability, latency and block height at the stated cadence.
2. **Given** all gates have run, **When** the results document is read, **Then** it contains one row per gate with a verdict and an evidence reference, plus a plain statement of what the results make possible, impossible and different for the design.
3. **Given** a gate that did not pass, **When** it is classified, **Then** it carries either a fallback trigger (only for the five defined hard conditions) or a design change with the adaptation written down.

---

### Edge Cases

- The network is unreachable when a gate starts: the exact error and UTC time are recorded, the probe keeps running, the gate is retried later, and the interruption is reported rather than hidden. The gate is `blocked`, not `fail`, until a real attempt returns an answer.
- The endpoint answers but reports a different chain identifier than the starting facts: the mismatch is recorded as a contradiction and flagged, and no later result is presented as if the starting fact held.
- Funding cannot be obtained by the fallback date because the faucet is dry or admins do not respond: this is a fallback trigger, not a design change.
- An account is funded natively but its contract-visible balance stays zero after the documented mapping attempts: the mapping assumption is disproved and the gate is `fail`, with the consequence for every later value-carrying gate stated.
- The token's decimal places make native and contract-visible amounts disagree by orders of magnitude: the conversion is documented with worked examples, because a silent factor error would corrupt every cost estimate.
- A transaction is rejected for exceeding a payload size rather than for cost: the rejection is recorded verbatim and treated as a hard limit, not as a tuning problem.
- A deployment's storage deposit exceeds the owner balance or the 5% per-probe cap: the probe is not sent; the deposit is estimated and recorded as unaffordable rather than spending the balance.
- `eth_getLogs` is limited on this RPC: gates that need events read them from the receipts of their own transactions or from recent blocks, and record the limitation instead of paging historical logs.
- The smallest viable proof exceeds cost or size limits even at depth 10: this is a fallback trigger.
- Randomness values are constant, or the previous block's value is unreadable: randomness is judged unusable and commit-reveal is stated as the alternative, with its added cost and latency.
- The values returned by a read call disagree with the values emitted by real transactions: the disagreement is reported, the transaction values are treated as authoritative for on-chain execution, and the verdict is based on them.
- The optional asset service is absent or errors on standard calls: it is reported as absent and the bond-asset module is marked as needing a substitute, without failing the tier.
- The probe process stops without being noticed: the gap is visible in the logs and is reported as a gap, never backfilled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The feature MUST begin with continuous network monitoring: reachability, latency and current block height for both the contract endpoint and the event-stream endpoint, recorded at least every three minutes into daily files for the whole measurement window, and left running after the gates finish until the owner stops it.
- **FR-002**: Monitoring MUST record failures verbatim with UTC timestamps, and MUST NOT fill gaps after the fact.
- **FR-003**: The feature MUST fund six distinct accounts — four providers, one vault/agent account and one owner account — using disposable keys generated locally into a gitignored `.env` with mode 600 and supplied only through environment variables, and MUST record each account's funded balance. Each burner MUST be one secp256k1 key whose EVM address is `viem`'s `privateKeyToAccount(key).address`; the Substrate account the chain reportedly uses for an unmapped Ethereum-derived key is the same 20 bytes followed by twelve `0xEE` bytes (candidate A), encoded to SS58 only with the prefix observed from `system_properties`. The project MUST NOT derive a Substrate account from the secp256k1 public key by blake2 or ECDSA hashing, because that account cannot spend funds signed for the EVM address. The owner/deployer account MUST be funded first, and G01 and G02 MAY proceed as soon as that single account is funded and usable; the remaining five MUST be funded in parallel.
- **FR-004**: The feature MUST document how a natively funded account relates to its contract-visible address, including the exact procedure used, and MUST demonstrate the relationship with at least one value transfer recorded by transaction reference. It MUST name the Substrate address the faucet must pay for an Ethereum secp256k1 key, chosen from inspected runtime metadata and recorded evidence rather than assumption, and MUST NOT request funds on a guess. Candidate B — a separate Substrate keypair per account plus `map_account` — MAY be used only if evidence disproves candidate A after the owner account is funded (the EVM balance of the candidate-A account stays zero, or an EVM transaction from it fails); adopting B implies Substrate-signed `Revive.call` extrinsics instead of viem/forge and MUST be recorded as a design change.
- **FR-005**: The feature MUST answer the decimal-places question: how native token amounts appear as contract-visible balances and as value sent with a call, with worked examples at realistic magnitudes.
- **FR-006**: The feature MUST deploy a disposable contract to the live network and call it successfully, and MUST record the exact tooling, versions, flags and compiler path that worked.
- **FR-007**: The feature MUST exercise, on the live network, contract state writes, event emission, a deliberate revert, value transfer, current block time and current block number, and MUST list every observed difference from expected Ethereum behavior.
- **FR-008**: The feature MUST record the contract code-size limit actually enforced, which contract compilation path the network accepts, and hashing cost as two ratios measured with their method: gas of `keccak256` over 32 bytes divided by gas of one new storage-slot write, and gas of `keccak256` over 32 bytes divided by gas of one event, where the reference event has one indexed topic and 32 bytes of data. The live size ladder MUST deploy at most three small probes of about 0.5, 2 and 4 KiB of runtime code; deposit per byte and the fixed per-contract part MUST be derived from those observations. The code-size limit MUST be read from runtime metadata/constants, not inferred from anvil's local limit or from a large live deployment. Any extension beyond three probes MUST be an `eth_estimateGas` dry run, performed only when the owner balance covers the implied deposit. No threshold is applied to the hash ratios and no verdict depends on them; the G04 payload ladder remains the authoritative hash-cost measurement.
- **FR-009**: A hard deployment failure is no successful deployment after two serious attempts with different toolchain paths within 48 hours. Individual failed attempts MUST be recorded with verbatim errors and retried; on a hard failure the feature MUST stop and report immediately rather than proceeding to later gates.
- **FR-010**: The feature MUST sample randomness and previous-block references over at least 30 consecutive blocks using read calls, AND MUST record at least 10 values emitted by real transactions, because a read call may not reflect on-chain execution. It MUST compare the two sets, report any disagreement, state whether the values change, whether the previous block is readable, and whether the result is usable for unpredictable challenge selection; if unusable, it MUST state commit-reveal as the alternative with its cost and latency implications.
- **FR-011**: The feature MUST measure the maximum transaction payload accepted, with the rejection for exceeding it recorded verbatim.
- **FR-012**: The feature MUST measure hashing cost for payloads of 1, 4, 16 and 64 KiB.
- **FR-013**: The feature MUST measure the cost of full Merkle verification using separated leaf and node hashing with index-derived path directions, for a 1 KiB and a 4 KiB leaf block at depths 10, 14 and 20.
- **FR-014**: The feature MUST compute the largest challenge response that fits within measured limits and MUST recommend a challenge block size within the 1–4 KiB target, with the arithmetic and the gas gate shown. The chosen size MUST be the largest in that range that fits both payload and verification-cost limits with a stated margin; if no size in the range fits, this is a hard failure.
- **FR-015**: The feature MUST measure: (a) the deposit per code byte and the fixed per-contract part; (b) the deposit for a new storage slot, a non-zero to non-zero rewrite, and clearing a slot to zero; (c) who receives the refund when a slot is cleared — the caller, the original payer or the contract; and (d) the cost of writing a realistic deal record packed into 1, 2 and 3 slots. It MUST state the resulting per-deal storage assumption for later tiers.
- **FR-016**: The feature MUST measure the cost of issuing, answering and resolving one challenge, and MUST compute the test currency required to sustain challenges for 14 days with three providers at 10, 20 and 30 minute intervals. The 14-day budget MUST be expressed in tPOT as gas plus deposits floated minus refunds, and MUST include the total tPOT needed to deploy Tier 1 contracts at 8, 12 and 16 KiB of runtime code.
- **FR-017**: The feature MUST determine whether an identity service exists and whether a provider account can set and read back an identity, recording the outcome either way.
- **FR-018**: The feature MUST determine, as an optional check, whether an asset service responds to standard token calls, and MUST record what those calls return without treating absence as a failure.
- **FR-019**: Every gate MUST end with a run state of `done`, `blocked` or `not_run`. A gate that reaches an answer MUST be `done` and MUST carry a verdict of pass, partial or fail together with the commands, raw output, transaction references and error text that support it. A gate that could not run because the RPC, the funds or an upstream gate were unavailable MUST be `blocked` with a reason, never `fail`, and a gate after a halt MUST be `not_run` with a reason. Pass means every required measurement was obtained and the gate's assumption holds; partial means the assumption holds only with caveats or some required measurement could not be obtained; fail means the assumption is disproved.
- **FR-020**: Every gate that is `done` with a non-passing verdict MUST be classified as either a fallback trigger or a design change; fallback classification MUST be limited to the five defined hard conditions, and every other non-passing gate MUST state its adaptation. When the third condition (an unusable RPC for several consecutive days) is claimed, `verdictReason` MUST state the observed outage length in hours so the classification can be audited.
- **FR-021**: The feature MUST produce a results document containing one row per gate with run state, verdict where one exists, and evidence reference, plus plain statements of what the findings make possible, impossible and different for the design.
- **FR-022**: The feature MUST produce a decision record listing each verified or contradicted assumption, the evidence for it, and the consequence for the design.
- **FR-023**: Starting facts supplied with this feature MUST be treated as unverified and MUST each be confirmed, corrected or marked unconfirmed with evidence.
- **FR-024**: The feature MUST NOT create any product contract, provider daemon, user interface or agent, and MUST NOT modify the project constitution or Spec Kit templates.
- **FR-025**: Evidence MUST be committed in small increments as it arrives, and checkpoint discipline MUST be observed: after the gates finish, the results bundle is written to the sync location and work stops for owner approval.
- **FR-026**: No credential, key or environment value may appear in any committed artifact, log line, specification or checkpoint; a detected exposure stops the work and is reported for rotation.
- **FR-027**: Every gate record MUST include the genesis hash and runtime spec version observed by this run at measurement time. A genesis hash reported by another team MUST be treated as `[reported]` until our own `chain_getBlockHash(0)` and runtime-version read confirm or contradict it.
- **FR-028**: G02 MUST include a deploy-less `eth_call` carrying creation bytecode that returns data, and MUST record whether state overrides are supported, with a plain yes or no and the raw response or error.
- **FR-029**: G07 MUST call the read-only runtime API `ReviveApi_account_id` for the owner's EVM address and compare the result with candidate A's AccountId32, recording `equal` or the exact difference.

### Key Entities *(include if feature involves data)*

- **Gate**: One named assumption check with an order, a question, required measurements, a verdict, a classification and evidence references.
- **Gate Verdict**: The outcome of a gate (pass, fail, partial), its supporting commands and raw output, transaction references, verbatim error text, UTC completion time, and classification where not passing.
- **Evidence Artifact**: A committed file containing a command, its raw output, its timestamp and the network reference it relates to.
- **Probe Entry**: A timestamped observation of endpoint reachability, latency and block height, grouped into daily files, including failures verbatim.
- **Burner Account**: A disposable identity with a role (provider, vault/agent, owner), supplied only through the environment, with a recorded funded balance.
- **Account Mapping**: The documented correspondence between a natively funded account and the address the contract sees, plus the demonstrated effect on value transfer.
- **Cost Measurement**: A labelled observation of resource cost for an operation (hashing, verification, storage, challenge round) at stated payload sizes and depths.
- **Challenge Block Size Recommendation**: The chosen block size, the arithmetic that produced it from measured limits, and the margin left for overhead.
- **Decision Record Entry**: One assumption, its verified state, the evidence, and the design consequence if it changed.
- **Starting Fact**: A supplied claim about the network that is unverified at the start and must be confirmed, corrected or left unconfirmed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All ten gates have a run state, every `done` gate has a verdict, and 100% of `done` verdicts cite at least one committed artifact containing the command, raw output and reference that support them.
- **SC-002**: Continuous monitoring covers at least 95% of the measurement window — defined as the first gate start to the last gate finish, with the probe's own start and stop timestamps recorded in G10 — at the stated cadence, with any gaps explicitly reported rather than filled.
- **SC-003**: Six accounts are funded and their balances recorded, with zero accounts funded through a key that is not supplied by environment variable.
- **SC-004**: A disposable contract is deployed and all six required behaviors are demonstrated on the live network, with a documented reproduction path a second person can follow without private context.
- **SC-005**: The 14-day challenge requirement is stated in test currency for all three intervals, and each figure is reproducible from recorded per-round measurements.
- **SC-006**: A challenge block size within the 1–4 KiB target is recommended, and its arithmetic accounts for both payload size and verification cost with a stated margin.
- **SC-007**: 100% of `done` gates with a non-passing verdict carry exactly one classification, and every fallback classification maps to one of the five defined hard conditions.
- **SC-008**: The results document states, in plain language, what is possible, what is not possible, and what changes in the design; every starting fact is marked confirmed, corrected or unconfirmed.
- **SC-009**: Zero credentials, keys or environment values appear in the repository, its logs, its evidence or the checkpoint bundle.
- **SC-010**: No product contract, daemon, interface or agent is created by this feature, and the constitution and Spec Kit templates are unchanged.

## Assumptions

- The supplied starting facts are stale until verified: the chain identifier, both endpoint addresses, the token name and its decimal places, the presence of both contract runtimes, the address-mapping requirement and the faucet's behavior are all treated as claims, not inputs to be built on.
- The work runs on one machine, by one operator, inside the hackathon window, with no ink!/WASM work and no multi-chain work.
- Test funds are available through a faucet or through administrators; requesting them is part of the work, and a dry faucet after the fallback date is a fallback trigger rather than a design change.
- The gate order is fixed by the owner: monitoring, funding, deployment, behavior, randomness, proof limits, storage cost, challenge cost, identity, assets. Identity and assets come last because they inform swappable modules rather than the core verification path.
- The asset-service check is optional, so absence is recorded as absent and never as a failed gate.
- Measurements are taken on the live test network during the measurement window; values are expected to drift, so every figure carries its timestamp and the conditions it was measured under.
- A disposable contract is acceptable for all behavior and cost measurements; no product logic is needed to answer any gate.
- "Usable randomness" means values that are unpredictable to a provider before the challenge is issued and readable on-chain at verification time; a value that is constant or predictable in advance is unusable.
- "Reproducible" means a second person can repeat the measurement from the committed record without access to the operator's environment.
- A gate that cannot run because the RPC, the funds or an upstream gate were unavailable is blocked, never failed; only a completed run can produce a fail.
- The owner account is funded first, and G01 and G02 run on it while the other five accounts are funded in parallel; the five are required from G06 and G08 onward.
- The 14-day horizon is a design assumption for the demo period, not a commitment to run for 14 days during this feature.
