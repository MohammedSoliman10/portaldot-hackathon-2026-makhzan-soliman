# Portaldot V3 gotchas — measured on the live testnet

Every number in this file comes from a command this repository ran against Portaldot V3 and saved
under `evidence/`. Nothing here is copied from documentation or from somebody else's claim. Labels:

- `[measured]` — read from the live chain or produced by a local computation on live data.
- `[design note]` — a conclusion drawn from the measured facts; it is not itself a measurement.

Chain: `portaldot-v3` spec `3002`, genesis `0xd4f9acbcf7f52388d8b095abe3c198d19fc510e0343e643e87cfbccb155283bd`,
EVM chain id `420420777`, contract `0x60481DFcFCA34A8F095939D9675eC715127B2e44`
(`evidence/raw/t1/78-chain-facts.txt`).

## 1. `via_ir` bytecode is accepted by the live chain `[measured]`

`contracts/foundry.toml` compiles with `solc 0.8.28`, `evm_version = "paris"`, `optimizer = true`,
`optimizer_runs = 1`, `via_ir = true`, `bytecode_hash = "none"`, `cbor_metadata = false`. The live
`eth_estimateGas` accepted that bytecode (`16516990194562195` gas), the deploy transaction mined
`success` at block `171308`, and `verify:deployment` compared the deployed runtime with the artifact
byte for byte: `6,566 B` each, `firstDiff: null`.

The runtime also reports `revive.allowEVMBytecode = true` and `revive.autoMap = true`.

Evidence: `evidence/raw/t1/59-live-deploy.txt`, `evidence/verify-deployment.json`,
`evidence/receipts/live/0xf29a52c507726ceed20861f2cc4cc5f937542d0caa42a7e2a369ea08c998e3e7.json`.

## 2. Deployment cost: about `0.0807 tPOT` per runtime byte `[measured]`

| Fact | Value |
| --- | --- |
| Runtime / creation bytes | `6,566 B` / `7,154 B` |
| `gasUsed` / effective price | `16262870374998956` / `32580 wei` |
| Measured cost | `529.844316817465986480 tPOT` |
| Estimate | `538.123540 tPOT` |
| Measured / estimate | `0.9846146412530473` |
| Cost per runtime byte | `0.0806951442000405 tPOT` |
| Cost per creation byte | `0.0740626665945577 tPOT` |

This cost is the gas charge (`gasUsed × 32,580 wei`), **not** a storage deposit. The contract's
separate storage deposit is covered in section 8.

`[design note]` Budget a deployment from measured runtime bytes, not from the artifact size and not
from the estimate: the estimate was 1.56% high, and the cost per creation byte is about 9% lower than the cost per runtime byte (0.0807 vs 0.0741 tPOT).

Evidence: `evidence/raw/t1/59-live-deploy.txt`, `evidence/raw/t1/81-deploy-cost.txt`,
`evidence/receipts/live/0xf29a52c507726ceed20861f2cc4cc5f937542d0caa42a7e2a369ea08c998e3e7.json`.

## 3. Gas price was effectively fixed at ~`32.5k wei` `[measured]`

Observed on our own transactions in the live run: `32,450`, `32,470`, `32,475`, `32,480`, `32,500`,
`32,505`, `32,580` wei. Range used: `32,450–32,580 wei`.

One daemon-sent answer carried `maxFeePerGas = 38,970 wei`, which is exactly `1.2 × 32,475`; that is
a cap, not a price paid, and that receipt does not record `effectiveGasPrice`, so no number is claimed
for it. The `revive.gasScale` constant reads `5`.

`[design note]` A fee policy of "chain gas price, priority fee 0, gas = estimate × 1.2" stayed inside
the cap on every transaction; do not hardcode `32,500`, read it.

Evidence: `evidence/raw/t1/59-live-deploy.txt`, `60-live-pass.txt`, `62-live-register.txt`,
`69-live-resolve-b.txt`, `70-live-claim-b.txt`, `71-live-settle-b.txt`.

## 4. The `10,000 wei` unit factor, with an existential deposit and dust `[measured]`

- Token properties read from the chain: `tokenSymbol = tPOT`, `tokenDecimals = 14`, `ss58Format = 42`.
  So `1 tPOT = 10^14 planck`.
- `revive.nativeToEthRatio = 10000`. So `1 planck = 10,000 wei` and `1 tPOT = 10^18 wei`.
- `balances.existentialDeposit = 10,000,000,000,000 planck` (`0.1 tPOT`, `10^17 wei`).
- `eth_getBalance` is not `native_free × 10,000`; it is
  `(native_free − existentialDeposit) × 10,000 + dust`, where `dust` is the sub-unit remainder
  (`5,700 wei` for the owner, `9,140 wei` for provider-1, `0` for the contract). All three
  reconciliations are exact.

`[design note]` `msg.value` must be an exact multiple of `10,000 wei`; the contract rejects dust with
`BadParams`. Never compare an `eth_getBalance` figure with a native balance without subtracting the
existential deposit first.

Evidence: `evidence/raw/t1/79-account-mapping-deposits.txt`.

## 5. A receipt can take longer than `15 s`; once it mislabelled a landed answer (T1-002) `[measured]`

The first live answer transaction `0x8da1f12d9db85123e4ea3a13c8e2aa57b373981a6b6df66c57ec153cea9ce8e3`
landed at block `172295`, well before its `172331` deadline, and the round passed on-chain
(`healthOf(1) = 1`, bond unchanged). The daemon had waited only `15 s` for the receipt, had not
persisted the hash first, and then labelled the closed round `unanswered`.

The fix persists the hash before any wait, uses a receipt timeout of at least `120 s` (the live rerun
used `600 s`), and keeps a timed-out round `submitted` until a later receipt and read-back resolve it.
The rerun labelled deal B `passed` from read-back only.

`[design note]` Never derive state from a receipt wait. Persist the submitted hash first, then poll.

Evidence: `evidence/raw/t1/60-live-pass.txt` (`ABORT CONDITION OBSERVED`),
`evidence/raw/t1/61-t1002-red.txt`, `61-t1002-green.txt`, `evidence/raw/t1/76-retrieval-gate.txt`.

## 6. Custom error selectors survive the EVM boundary `[measured]`

Free `eth_call` against historical blocks returned payloads that are exactly the four-byte selector:

| Error | Selector | Live observation |
| --- | --- | --- |
| `NotOwner()` | `0x30cd7471` | challenge by non-owner, block `172280` |
| `NotProvider()` | `0x3480e2b2` | answer by non-provider, block `172290` |
| `BadParams()` | `0x019af637` | `createDeal` with duration `99`, latest |

Each payload was recomputed as `keccak256(signature)[0..4]` and matched.

`[design note]` A client can decode a revert from `error.data` alone; there is no need for a registry
call or an ABI file on the read path.

Evidence: `evidence/raw/t1/63-live-refusals.txt`, `evidence/raw/t1/80-error-selectors.txt`.

## 7. Account mapping: `H160 + 12 × 0xEE`, and the reverse map is empty `[measured]`

The runtime maps an H160 to `accountId32 = h160 ‖ 0xee × 12`. The contract
`0x60481DFcFCA34A8F095939D9675eC715127B2e44` therefore maps to
`0x60481dfcfca34a8f095939d9675ec715127b2e44eeeeeeeeeeeeeeeeeeeeeeee`, which renders as
`5EEwsqgiEVZNUdUHdmsEMqBQzJjNy5PULPBYoo5yF2GX45DZ` at SS58 prefix `42`; the owner maps to
`5CGsx4vqstCP2bnkGn4TsAvCCYE3jBUohM2tGCtbSVLduZpE` and provider-1 to
`5Hbqft1roeX13KBJHkYY1jSPCR3Ef6yFtxkMgJF9YxM5M3UQ`.

`revive.autoMap = true`. `revive.originalAccount(h160)` returned `null` for all three addresses, so
the reverse map is not a lookup source. The mapping was confirmed by the exact balance reconciliation
in section 4, not assumed from the address shape.

`[design note]` A balance check on either form must convert: the SS58 form shows `free`, while
`eth_getBalance` shows `(free − 0.1 tPOT) × 10,000 + dust`.

Evidence: `evidence/raw/t1/79-account-mapping-deposits.txt`.

## 8. Storage deposits: the receipt does not split them, the account view does `[measured]`

A receipt on this chain carries `status`, `blockNumber`, `gasUsed`, `effectiveGasPrice`, `logs` and
the usual fields. It has **no** gas-versus-deposit breakdown. That is the part the RPC does not expose.

The account-level split **is** readable through `revive.accountInfoOf(h160)`. For our contract:

| Component | Planck | tPOT | Derivation |
| --- | --- | --- | --- |
| `storageBaseDeposit` | `12709800000000000` | `127.098` | base deposit, no single constant reproduces it |
| `storageItemDeposit` | `1500000000000` | `0.015` | `10 × depositPerChildTrieItem (1.5e11)` |
| `storageByteDeposit` | `3840000000000000` | `38.4` | `640 B × depositPerByte (6e12)` |
| **Sum** | `16551300000000000` | `165.513` | equals `system.account.reserved` exactly |

`revive` constants read: `depositPerByte = 6000000000000`, `depositPerItem = 15000000000000`,
`depositPerChildTrieItem = 150000000000`, `codeHashLockupDepositPercent = 300000000`.

`revive.nativeDepositOf` is a two-key map; `entries()` returned `0` rows on this testnet, and both
EOAs hold `reserved = 0`. So no caller-held deposit exists to be refunded.

**Correction to the brief.** The check-in note said "storage-deposit split not exposed by the RPC".
Measured reality: the per-receipt split is not exposed, but the per-account split is, and it
reconciles exactly. This is recorded in `docs/decisions.md`.

Evidence: `evidence/raw/t1/79-account-mapping-deposits.txt`.

## 9. `answer` and `settle` callers received no slot refund `[measured]`

| Transaction | Caller | Measured balance delta | Receipt fee | Match |
| --- | --- | --- | --- | --- |
| `answer` deal 1 (`0x8da1f12d…`) | provider-1 | `−162,915,694,292,617,500 wei` | `gasUsed 5,012,790,593,619 × 32,500` | exact |
| `settle` deal 1 (`0x312534d4…`) | owner | `−15,314,505,821,880,160 wei` | `gasUsed 471,505,721,117 × 32,480` | exact |
| `settle` deal 2 (`0x59d61ee8…`) | owner | `−15,314,494,987,996,050 wei` | `gasUsed 471,941,293,929 × 32,450` | exact |

The deltas are fee-only: there is no credit line of any size, and section 8 shows there is no caller
deposit to return. The contract holds the storage deposit in its own reserved balance.

`[design note]` Do not advertise a keeper refund for answering or settling. Budget gas only; a caller
who expects a rebate will not get one.

Evidence: `evidence/raw/t1/60-live-pass.txt`, `65-live-settle-a.txt`, `71-live-settle-b.txt`,
`72-live-summary.txt`, `evidence/receipts/live/`.

## 10. TransactionStorage: what its metadata actually offers `[measured]` + `[design note]`

Read at spec `3002`, pallet `TransactionStorage` (index `51`):

- Calls: `store(data: Bytes)`, `renew(block: u32, index: u32)`, `checkProof(proof: SpTransactionStorageProofTransactionStorageProof)`.
- Constants: `MaxBlockTransactions = 512`, `MaxTransactionSize = 8388608` bytes (`8 MiB`).
- Storage items: `ByteFee = 10`, `EntryFee = 1000`, `RetentionPeriod = 100800` blocks,
  `Authorizations`, `Transactions`, `BlockTransactions`, `ProofChecked`.
- `RetentionPeriod` doc: data older than `RetentionPeriod` blocks is eligible for removal unless
  renewed; validators prove possession of block `N − RetentionPeriod` when producing block `N`.
- No storage-period or retention value appears in the runtime **constants**; retention is a storage
  item, and `maxBlockTransactions`/`maxTransactionSize` are the only two constants.
- `paymentInfo` for `store` (dry-run, no signing, public account): `0 B` → `1,100,634,700,081` planck
  (`0.01100634700081 tPOT`); `1 KiB` → `0.11350639380136 tPOT`; `32 KiB` → `3.28830788705109 tPOT`;
  `1 MiB` → `104.86915567090586 tPOT`; `4 MiB` → `419.44210364626048 tPOT`. The `8 MiB` probe hit the
  RPC's 60 s response limit and is **not measured**. `renew` → `1,170,665,277,570` planck
  (`0.0117066527757 tPOT`).
- `paymentInfo` returns one `partialFee`; it does not break the fee into base, length, weight or
  storage components.

`[design note]` The pallet puts bytes in blocks. Its metadata shows no client-facing promise, payment,
bond or penalty entry point: no way for a client to require a provider to keep a block, to be paid if
it does not, or to challenge a miss and take money from a bond. That is why Makhzan is an EVM
contract with its own bonded provider, random challenge, slash and `healthOf` gate, instead of a
wrapper around `store`.

Evidence: `evidence/raw/t1/78-chain-facts.txt`.
