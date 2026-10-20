# T029A — which bytecode does Portaldot V3 accept?

UTC: 2026-10-20T05:35Z. Read-only; no transaction sent.

## 1. Runtime metadata (live)

Command: `node src/gates/runner.ts G07` (metadata section) and `node src/tools/scanCode.ts 120`
Raw: `evidence/raw/g07/03-metadata.txt`, `evidence/raw/g01/00-code-scan.txt`

| Constant | Value | Meaning |
| --- | --- | --- |
| `revive.allowEVMBytecode` | `true` | the runtime is configured to accept EVM bytecode, not only PolkaVM |
| `revive.chainId` | `420420777` | EVM chain id |
| `revive.autoMap` | `true` | EVM accounts are mapped on first use |
| `revive.nativeToEthRatio` | `10000` | native/EVM value factor (derived later in G07) |
| `revive.gasScale` | `5` | gas scaling constant |
| `revive.depositPerByte` | `6000000000000` | code deposit per byte (planck) |
| `revive.maxEthExtrinsicWeight` | `0x00000000000000000c7d713b49da0000` | max weight per ETH extrinsic |

Runtime: `portaldot-v3` spec `3002`. `revive` calls include `ethInstantiateWithCode`,
`ethTransact`, `instantiateWithCode`, `uploadCode`, `setCode` and `mapAccount`.

## 2. On-chain code survey

Command: `node src/tools/scanCode.ts 120` (first attempt with 2000 blocks failed: the public RPC
prunes state, `UnknownBlock: State already discarded ... (4003)`).

Result (verbatim in `00-code-scan.txt`):

- blocks `113026..113145` scanned, **0 transactions**, **0 contract creations**;
- the latest block has `transactions: []`, `gasUsed: 0x0`, and the empty-trie roots
  `0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421`;
- therefore there is **no existing contract on this chain to sample with `eth_getCode`**.

This is a finding in itself: the testnet was empty at the time of the check, so bytecode
acceptance cannot be inferred from deployed code.

## 3. Public documentation

| Source | Statement |
| --- | --- |
| DoraHacks hackathon page (PortaldotV3 testnet section) | Portaldot V3 is presented as an EVM-compatible testnet; faucet wants native SS58 addresses. |
| Portaldot on X (`@PortaldotL0`) | "Portaldot Network V3.0 is fully compatible with the EVM contract ecosystem. It supports WASM and EVM contract execution, and ERC-20 / ERC-721 token standards." |
| Polkadot developer docs, "Add a Smart Contract to Your Product" | pallet-revive contracts on Polkadot run as PolkaVM; Solidity is compiled with `resolc`. This is the generic Polkadot path, not a Portaldot-specific recipe. |

No Portaldot-specific deploy recipe, foundry config or resolc binary was published in the
hackathon material retrieved so far.

## 4. Chosen attempt order for G01

1. **EVM bytecode from solc 0.8.28, `evm_version = paris`, deployed with a viem wallet client.**
   Reasons: the runtime constant `allowEVMBytecode = true` is explicit; Portaldot's own
   announcement claims full EVM-contract compatibility; the chain exposes an Ethereum JSON-RPC
   (`eth_sendRawTransaction`, `eth_getCode`) and a chain id; this is the shortest reproducible path.
2. **PolkaVM bytecode from `resolc`, instantiated through `revive.instantiateWithCode` (Substrate
   API).** This is the generic pallet-revive path and the fallback if EVM bytecode is rejected.
   `resolc` is not installed yet; if attempt 1 fails, install the pinned release, compile the same
   source, and record the verbatim rejection/acceptance before changing `foundry.toml`.

`contracts/foundry.toml` stays at solc `0.8.28` / `evm_version = paris` until G02 proves otherwise.
