# Makhzan Constitution

## Core Principles

### I. Tests Before Funds (NON-NEGOTIABLE)

Any contract that custodies or moves value MUST have unit, fuzz and invariant tests written before its
implementation. Tests MUST exist, MUST fail for the right reason (failing because the behavior is
missing, not because of compile or setup errors), and MUST be recorded as failing before the
implementation lands. Test tasks MUST appear before implementation tasks in every `tasks.md`. No
deployment that holds value proceeds while a fuzz or invariant suite is absent, skipped or failing.

Rationale: the bond is the economic guarantee behind storage. An untested custody path converts a
storage bug into a loss of funds, and no amount of later auditing restores the user's trust or tokens.

### II. Small, Daily Commits

Commits MUST be small and scoped: one per task or small group of tasks, in `type(scope): summary`
form, with `[ai]` added when the code is AI-written. There MUST be at least one meaningful commit on
every working day. Core modules MUST NOT be batched into a single commit and MUST NOT land in the
final 24 hours before the 2026-11-06 04:00 UTC freeze.

Rationale: an auditable history is the only way a solo build can be reviewed, and a freeze-day
mega-commit is unreviewable by construction.

### III. No Secrets, Ever (NON-NEGOTIABLE)

Private keys, API keys and `.env` contents MUST NOT be printed, logged, echoed, committed or pasted
into code, specs, evidence, commit messages or checkpoints. Configuration is supplied through
environment variables; the repository carries `.env.example` with variable names and empty values
only. Provider and keeper keys MUST be burner keys. If a secret appears anywhere, work stops and the
owner is told to rotate it.

Rationale: a single leaked key ends the project and can cost funds. Detection must be treated as an
incident, not a lint warning.

### IV. Bounded Agent Authority

The AI agent MUST never decide whether a proof passed, and MUST never hold uncapped control of funds.
Contracts MUST enforce spend caps, per-provider caps, minimum copy counts and freeze conditions
on-chain. Model output MUST be schema-validated before it is used for any decision or transaction.
Any path where model output could authorize a payout without an on-chain cap is a violation, not a
trade-off.

Rationale: the agent is the product's first customer and its least trustworthy component. Its
judgement can be wrong or manipulated; caps are what keep a bad decision cheap.

### V. Evidence Over Claims

Every claim in the README, deck or video MUST be backed by a tx hash, a test result, a measurement or
a labeled recorded run, and the supporting artifacts MUST be stored under `evidence/`. Nothing is
marked done on assumption. Failures are reported verbatim. The README MUST keep an
implemented / simulated / roadmap table, and every row MUST match its evidence.

Rationale: judges and users cannot inspect intent, only artifacts. An unbacked claim is a liability
the moment someone asks for the hash.

### VI. Honesty About Limits

Documentation MUST state what the proofs do and do not guarantee, name the trusted components
(keeper, randomness source) and list what was not built. No WASM, native-asset or multi-chain
capability may be claimed unless the repository demonstrates it.

Rationale: overclaiming is the fastest way to lose credibility with a technical audience, and it
hides the real trust assumptions from users who are putting value at stake.

### VII. Modular Design

Contracts MUST sit behind the `IMakhzan` interface. The bond asset and the identity link MUST be
swappable modules, so that either can be replaced without rewriting the core storage and challenge
logic. Core contracts MUST remain open source.

Rationale: the bond asset and identity scheme are the parts most likely to be contested or replaced;
isolating them keeps the verifiable core stable.

### VIII. Untrusted Input

All external text MUST be validated before use, including stored data, provider metadata, model
output and user input. Validation MUST reject unexpected types, sizes, encodings and field sets; a
parser that only checks for presence is not validation.

Rationale: stored bytes are attacker-controlled by definition in a storage system, and model output
inherits the untrustworthiness of whatever text it read.

### IX. Local First, Live Second

Development and testing MUST happen on a local Foundry node. Deployment to the live Portaldot testnet
happens only when a feature requires it. When the RPC is unavailable, the exact error and UTC time
MUST be recorded, the work continues locally, and the deployment is retried later.

Rationale: a remote chain is a shared, flaky dependency. Local execution keeps the build unblocked
and makes failures reproducible.

### X. One Feature Per Tier

Work MUST cover exactly one Spec Kit feature per tier, and changes stay inside the active feature.
Unrelated files and `.specify/` templates MUST NOT be touched. Each feature's out-of-scope list is
binding.

Rationale: a solo build inside a fixed window fails by diffusion, not by lack of ambition.

### XI. Disclosure

AI-assisted code MUST be marked where it appears, every third-party library MUST be disclosed with
its licence, the repository MUST include a LICENSE, and the core contracts MUST be open source.

Rationale: users and judges are entitled to know what generated the code and what it depends on
before they rely on it.

### XII. Explainability

Every user-visible flow MUST have a plain-English explanation in `docs/EXPLAIN.md`, covering what the
flow does, what the user is trusting and what it costs.

Rationale: bonded storage with a challenge game is not self-explanatory; if a user cannot follow the
flow, they cannot consent to the risk.

### XIII. Reproducibility

A stranger MUST be able to clone the repository, install dependencies, run the tests and run the demo
by following the README alone, without private context, hidden steps or unavailable services.

Rationale: a demo nobody can reproduce is a claim, not a working system.

### XIV. Privacy by Default

Agent memory MUST be encrypted client-side before it is stored, unless the content is explicitly
marked public. Plaintext memory MUST NOT be written to the chain or to any provider by default.

Rationale: the agent's memory is the most sensitive data in the system, and storage providers are
untrusted by design.

### XV. Proofs Carry Bytes (NON-NEGOTIABLE)

A proof of possession MUST include the challenged bytes themselves. A response containing only hashes
MUST never be accepted. The challenge unit MUST be a small block, targeted at 1–4 KiB, independent of
how files are chunked for transport; the final size is fixed by the gas gate.

Rationale: hashes alone prove knowledge of a commitment, not custody of the data. Requiring the bytes
is what makes retrieval verifiable at a cost the provider cannot fake.

### XVI. Merkle Hardening (NON-NEGOTIABLE)

Merkle proofs MUST use domain-separated leaf and node hashing. The leaf count MUST be committed in the
deal. Path directions MUST be derived on-chain from the challenged index and MUST never be supplied by
the prover. Non-power-of-two trees MUST be handled explicitly. A proof valid for position `i` MUST
fail for any other position `j`.

Rationale: unattended Merkle code is where second-preimage and index-confusion attacks live; each rule
closes a specific, known forgery.

### XVII. Reality Over Spec, and Checkpoint Discipline

When the live chain contradicts an assumption, work stops, the contradiction is recorded in
`docs/decisions.md` and flagged in the checkpoint. It MUST NOT be silently worked around. After every
stage chain and every implement phase, a checkpoint bundle is written to the sync folder and work
stops until the owner approves.

Rationale: the spec is a prediction. Treating a contradicted prediction as still true produces a demo
that fails in front of the people it was built for.

## Security & Disclosure Constraints

- **Deployment targets**: local Foundry node for development; Portaldot testnet only when a feature
  requires live behavior. Mainnet is out of scope for the hackathon.
- **Custody surface**: any contract path that moves bond value is subject to Principle I and
  Principle IV. Caps are enforced in contract state, not in client code.
- **Proof verification**: verification logic is on-chain and does not consult the agent. Anything the
  agent attests is advisory input, never an acceptance signal.
- **Evidence hygiene**: evidence artifacts are checked for `.env` values before being copied to the
  sync folder. Evidence contains commands, raw output, tx hashes and explorer references.
- **Licensing**: the repository ships an MIT LICENSE; each third-party dependency is listed with
  version and licence in the README.
- **Key handling**: keys exist only in environment variables or an ignored local file. Test keys are
  created with `solana-keygen`-style throwaway generation or Foundry equivalents under ignored paths,
  never committed.

## Development Workflow & Quality Gates

- **Tier flow**: one Spec Kit feature per tier — `specify` → `clarify` (when ambiguous) → `plan` →
  `tasks` → `analyze` → `implement` → checkpoint. Templates under `.specify/` are read-only.
- **Test order**: task lists place failing unit, fuzz and invariant tests before implementation tasks
  for any value-holding contract. A tier's acceptance criteria include its test results, not only its
  demo path.
- **Local gate**: `forge build`, `forge test -vv` and `forge fmt` (or the project's equivalent) run
  before any "done" claim, and their real output is pasted into the checkpoint.
- **Live gate**: a live deployment requires a recorded local pass first, the exact RPC used and the tx
  hash. RPC outages are logged with the verbatim error and a UTC timestamp.
- **Checkpoint gate**: no phase advances without an owner "go". The checkpoint bundle contains
  `CHECKPOINT.md` plus `spec.md`, `plan.md`, `tasks.md`, the analyze output and relevant evidence.
- **Documentation gate**: README (implemented / simulated / roadmap table, AI-assistance marking,
  dependency disclosure), `docs/EXPLAIN.md` and `docs/decisions.md` are updated as part of the tier
  that changes behavior, not afterwards.

## Governance

This constitution supersedes other practices where they conflict. Amendments are made only by the
human owner; AI agents may propose an amendment but MUST NOT apply one without owner approval.

Amendment procedure:

1. The owner states the change and the reason.
2. The amendment is drafted against this document with a Sync Impact Report.
3. The version is bumped per the policy below and the amendment date is set.
4. Dependent templates and documents are checked for consistency; conflicts are reported, not
   silently resolved.
5. The owner approves before the amended file is committed.

Versioning policy (semantic):

- **MAJOR**: removal or redefinition of a principle, or a backward-incompatible governance change.
- **MINOR**: a new principle or section, or materially expanded guidance.
- **PATCH**: clarifications, wording fixes and non-semantic refinements.

Compliance review expectations:

- Each tier's `plan.md` and `tasks.md` state which principles apply and how they are satisfied.
- The checkpoint reports compliance status, deviations and open risks; a known violation blocks
  advancement until the owner decides.
- Tests, evidence and documentation are the artifacts of compliance. A principle without an artifact
  is treated as unmet.
- Unresolved contradictions between the live chain and this constitution are recorded in
  `docs/decisions.md` and escalated at the next checkpoint.

**Version**: 1.0.0 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-20
