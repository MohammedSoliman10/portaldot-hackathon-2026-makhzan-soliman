# Decisions

Short, dated records of decisions that change how the Tier-0 gates measure the live chain. These are
not product decisions; they exist so a later reader can see why a gate was measured the way it was.

## DR-001 — G03 samples latest state only (2026-10-20)

**Context.** During T029A a 2,000-block lookback failed with
`UnknownBlock: State already discarded ... (4003)`. A 120-block scan worked, so the public RPC keeps
only a recent state window. G03 originally implied reading randomness once per block and comparing
with transaction-emitted values; a later replay of historical `eth_call` samples would not be
reproducible.

**Decision.** The G03 sampler waits for each new block, then calls the probe at `latest` immediately.
It records the block number, block hash and UTC timestamp with every sample. It never addresses a
historical block number. Transaction-emitted values remain the authoritative comparison.

**Consequences.** Samples are captured live and cannot be regenerated after the pruning window. The
raw file must be written as sampling runs, not reconstructed later. If the sampler falls behind, it
records the missed blocks instead of backfilling them.

**Evidence.** `evidence/raw/g01/00-t029a-bytecode.md`, `evidence/raw/g10/` probe coverage.

## DR-002 — EVM/`solc` first, `resolc`/PolkaVM fallback (2026-10-20)

**Context.** The chain reports `allowEVMBytecode=true`, so both EVM bytecode and PolkaVM blobs are
accepted in principle. Standard Foundry 1.8.5 (`forge 1.8.5`) has no `--resolc` option; the
ParityTech Foundry-Polkadot fork adds it but is not installed in this environment.

**Decision.** G01/G02 attempt the EVM/`solc` path first. On failure they can attempt the same contract
source through the `resolc` 1.4.0 CLI, which produces a PVM blob. Both paths use the shared
`deployProbe` helper in `apps/gates/src/lib/deploy.ts`, so the call/verification code is identical.
The G02 size ladder remains an EVM-runtime measurement until a PVM-specific size probe is proven;
if G02 has to run on PVM, that limitation is recorded rather than papered over.

**Pins.** `resolc` 1.4.0 (`sha256 74e051ce27300c77e82e323f5c47acf2c452819b6a8d0eb21bf5b9111e7a686d`),
solc `0.8.28` for both paths.

**Evidence.** `evidence/raw/g01/05-resolc.txt`, `evidence/raw/g01/CounterProbe.pvm`.
