# TransactionStorage Deal Manifest Anchoring — Portaldot V3 Testnet

Collected at: `2026-11-05T10:22:33Z`
Endpoint: `wss://test-node-v3.portaldot.dev`
Chain: `portaldot-v3` (spec `3002`, chainId `420420777`)
Signer: `5CXe6SQaDPsA9ngkmd1U63x4ktLnrkmwRJR5AneeFJdLcSQF` (HUB1)
Pallet: `transactionStorage` (index 51)
Call: `store(data: Bytes)`

---

## 1. Summary of Anchors

| Metric | Anchor 1 (Primary) | Anchor 2 (Duplicate Submit) |
| :--- | :--- | :--- |
| **Block Number** | `333185` | `333189` |
| **Block Hash** | `0x9106e229f61f6ef793fc0c15cc9719e849b07e4b56ca37651e92fd28b80c8d39` | `0x4663aea7b2a8718895f4e38e8b02987a528ac76176b28dc6f0483b2749493685` |
| **Extrinsic Hash** | `0x622262a662fc517b957a4da35912637109b7e5c07c35a008964a61292ba106fc` | `0xad209e843ec732f72031cf0e971a6486509a3f72b9767879abbcefb2d897d354` |
| **Extrinsic Index** | `1` | `1` |
| **Signer Nonce** | `9` | `10` |
| **Block Timestamp** | `2026-11-05T10:06:48.000Z` (`1793873208000`) | `2026-11-05T10:07:12.000Z` (`1793873232000`) |
| **Retention Period** | `100,800` blocks (~7 days) | `100,800` blocks (~7 days) |
| **Expiry Block** | `433985` | `433989` |
| **Estimated Expiry UTC** | `2026-11-12T10:06:48.000Z` | `2026-11-12T10:07:12.000Z` |
| **Event Emitted** | `transactionStorage.Stored(0, 0x62cc...39eb)` | `transactionStorage.Stored(0, 0x62cc...39eb)` |
| **Event Index** | `4` | `4` |
| **Event ContentHash** | `0x62cc9db432d5b3b553565f0d5e05b0312e4244d7ab424b9188ae18e62c8b39eb` | `0x62cc9db432d5b3b553565f0d5e05b0312e4244d7ab424b9188ae18e62c8b39eb` |
| **Chunk Root** | `0xea74ca619064ac9e1509ff7e00d1ec9b63d301d5ff76dae618c2ec73163e8cb1` | `0xea74ca619064ac9e1509ff7e00d1ec9b63d301d5ff76dae618c2ec73163e8cb1` |
| **Payload Size** | `283` bytes | `283` bytes |
| **Transaction Fee** | `3,940,482,682,698` planck (`0.03940482682698 tPOT`, about `0.039405 tPOT`) | `3,940,482,678,968` planck (`0.03940482678968 tPOT`, about `0.039405 tPOT`) |
| **Storage Fee Held** | `3,830` planck (`0.00000000003830 tPOT`) | `3,830` planck (`0.00000000003830 tPOT`) |
| **Total Paid** | `3,940,482,686,528` planck (`0.03940482686528 tPOT`) | `3,940,482,682,798` planck (`0.03940482682798 tPOT`) |

*Note on Hashes:* The hashes originally recorded from the node console (`0x9106e229...` and `0x4663aea7...`) are the block hashes of blocks 333185 and 333189. The extrinsic hashes of `transactionStorage.store` within those blocks are `0x622262a6...` and `0xad209e84...`.

---

## 2. Manifest Payload Details

The stored payload is byte-for-byte identical in both extrinsics:

```json
{"schema":"makhzan-manifest-v1","chainId":420420777,"contract":"0x60481DFcFCA34A8F095939D9675eC715127B2e44","dealId":6,"root":"0xd2ba07e118c1fccf503c7ff03ecf24e4fee66dad6ebaea65e2a1c6b0113870c7","size":1048576,"leafCount":1024,"provider":"0xf4ec143c743FF57c0D32e829f50692551CBf6029"}
```

Hex representation (283 bytes):
`0x7b22736368656d61223a226d616b687a616e2d6d616e69666573742d7631222c22636861696e4964223a3432303432303737372c22636f6e7472616374223a22307836303438314446634643413334413846303935393339443936373565433731353132374232653434222c226465616c4964223a362c22726f6f74223a22307864326261303765313138633166636366353033633766663033656366323465346665653636646164366562616561363565326131633662303131333837306337222c2273697a65223a313034383537362c226c656166436f756e74223a313032342c2270726f7669646572223a22307866346563313433633734334646353763304433326538323966353036393235353143426636303239227d`

---

## 3. Storage Verification

Querying `transactionStorage.transactions(333185)` and `transactionStorage.transactions(333189)` returns:

```json
[
  {
    "chunkRoot": "0xea74ca619064ac9e1509ff7e00d1ec9b63d301d5ff76dae618c2ec73163e8cb1",
    "contentHash": "0x62cc9db432d5b3b553565f0d5e05b0312e4244d7ab424b9188ae18e62c8b39eb",
    "size": 283,
    "blockChunks": 2
  }
]
```
