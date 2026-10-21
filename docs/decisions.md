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

## DR-003 — Storage deposits are balance, not just gas (2026-10-20)

**Context.** Other teams report `[reported]`: about 0.079 tPOT per code byte plus about 13 tPOT per
contract for deployment, about 3.9 tPOT per new slot (refunded when cleared), and that
`eth_estimateGas` includes the deposit. If true, a 24 KiB size ladder would cost roughly 1,475 tPOT
and a gas limit is not a safe proxy for affordability.

**Decision.** Treat every deposit as real balance. G02 deploys at most three small probes (~0.5, 2
and 4 KiB runtime code) and derives deposit per byte plus the fixed part; the code-size limit comes
from runtime metadata/constants, and any further size is an `eth_estimateGas` dry run only when the
owner balance covers it. No single probe may spend more than 5% of the owner balance. G05 measures the
deposit matrix and the refund recipient; G06 states its budget as tPOT = gas + deposits floated −
refunds and includes Tier 1 deployment at 8, 12 and 16 KiB runtime code.

**Consequences.** G02's live size answer may be `PARTIAL` if the three probes do not bracket the
limit; the metadata limit is then the recorded answer with that caveat. Anvil's 24,576-byte result is
never reported as the chain's limit.

**Status.** `[reported]` until our own G02/G05 measurements confirm or correct it.

## DR-004 — Chain identity in every gate record (2026-10-20)

**Context.** A team reports genesis `0xd4f9acbc…283bd`. Our records currently do not pin the chain
identity at measurement time, so a later reader cannot tell whether a gate ran against the same chain.

**Decision.** Every gate record includes our own `chain_getBlockHash(0)` and runtime spec version,
read at measurement time. The reported genesis is a cross-check only; our own read decides
`equal`, `different` or `unconfirmed`. G07 also calls the read-only `ReviveApi_account_id` for the
owner EVM address and compares it with candidate A.

**Consequences.** A genesis or spec mismatch is recorded as a contradiction and flagged, not worked
around silently. The check is read-only and costs no funds.

## DR-005 — RPC event and finality shape (2026-10-20)

**Context.** `[reported]`: `eth_getLogs` is limited, blocks take about 6 s, and the finalized head lags
the best head by 1–2 blocks.

**Decision.** Gates read events from their own transaction receipts or very recent blocks, never from
a long historical `eth_getLogs` query. Where finality matters, the gate waits for the finalized head
and records both heads. The reported numbers are re-measured, not assumed.

**Consequences.** G03's latest-state sampling (DR-001) remains correct; a receipt is authoritative
for event values. A limited `eth_getLogs` is recorded as an RPC limitation, not as a gate failure.

## DR-010 — Tier 0 live spending caps (2026-10-21)

**Context.** The reported funding stash is about 1,500 tPOT, delivered to native SS58 addresses.
The Tier 1 deploy is estimated at about 718 tPOT, and the Tier 0 probes must not consume it. Recon on
2026-10-21T07:10:22Z observed HUB2
`5HnABVM6AYZS1WR2x8mF4Z4gmUnSUp5E7rwASY5svrns7LZp` at 500 tPOT free, not the reported 1,500.

**Decision.**
- The owner keeps an **untouched 800 tPOT reserve** for the Tier 1 deploy.
- Total Tier 0 live spend, gas **and** storage deposits included, is capped at **250 tPOT**.
- No single probe deposit may exceed **60 tPOT**. The 2 KiB and 4 KiB size rungs are therefore
  `eth_estimateGas` dry runs only; they are not deployed.
- Before every live deploy, print the estimate and abort if it would break either cap.
- Record every transaction hash and the balance before and after the transaction.

**Consequences.** A probe whose estimate exceeds 60 tPOT is not sent. If the owner's spendable
balance cannot cover both the 800 tPOT reserve and the live probes, the live phase stops and reports
the shortfall rather than spending the reserve. The observed 500 tPOT HUB2 balance cannot fund both
the 800 tPOT reserve and the 75% fan-out; the fan-out plan records the conflict and does not move
funds without the owner's decision.

**Evidence.** `evidence/raw/g07/09-funding-recon.txt`, `evidence/raw/g07/10-fanout-plan.txt`.
