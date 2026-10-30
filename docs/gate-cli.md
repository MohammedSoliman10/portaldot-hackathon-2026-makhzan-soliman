# StorageGate CLI Commands

The Makhzan CLI (`apps/makhzan`) provides standalone guarded commands for interacting with [`StorageGate`](../contracts/src/makhzan/StorageGate.sol). These commands reuse the same five-state transaction pipeline, preflight gas estimation, receipt timeouts, and finality guarantees as core deal operations (`create`, `claim`, `settle`).

---

## 1. Commands

### `gate status <dealId>`
Read-only command querying the on-chain lock, deal health, provider bond, and release verdict.

```bash
# Local or live read-only query (requires no private key)
node apps/makhzan/src/cliMain.ts gate status <dealId> [--gate <address>]
```

Output:
```json
{
  "label": "gate:status",
  "readBack": {
    "dealId": 3,
    "gate": "0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA",
    "makhzan": "0x60481DFcFCA34A8F095939D9675eC715127B2e44",
    "currentBlock": 248632,
    "lock": {
      "payer": "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
      "payee": "0xf4ec143c743FF57c0D32e829f50692551CBf6029",
      "amountWei": "2000000000000000000",
      "amountTpot": "2.000000",
      "minBondUnits": "2000000000000000",
      "minBondTpot": "20.000000",
      "status": 1,
      "statusName": "locked"
    },
    "deal": {
      "owner": "0x0948EBD7637D1C32858a6FC5D947E85A6600205C",
      "endBlock": 249232,
      "providerId": 1,
      "health": 1,
      "guardDecision": "healthy"
    },
    "provider": {
      "id": 1,
      "bondUnits": "2400000000000000",
      "bondTpot": "24.000000",
      "registered": true
    },
    "verdict": {
      "releaseWouldPass": true,
      "reason": "all release conditions met"
    }
  }
}
```

---

### `gate lock <dealId>`
Deposits payment into [`StorageGate`](../contracts/src/makhzan/StorageGate.sol) locked on an active, healthy deal. Signed by the deal owner.

```bash
# Options:
#   --payee <address>     Provider address (payee)
#   --min-bond <tPOT>     Provider bond floor in tPOT (converted to units)
#   --amount <tPOT>       Payment amount in tPOT locked in the gate
#   --cap <tPOT>          Optional maximum spend cap (value + fee)
#   --live                Required flag when MAKHZAN_NETWORK=live
node apps/makhzan/src/cliMain.ts gate lock <dealId> \
  --payee <payeeAddress> \
  --min-bond <minBondTpot> \
  --amount <amountTpot> \
  [--cap <capTpot>] \
  [--live]
```

---

### `gate release <dealId>`
Claims payment from [`StorageGate`](../contracts/src/makhzan/StorageGate.sol) to the payee. Signed by the recorded payee (Provider-1).

```bash
# Must be executed by the payee while deal is healthy and provider bond >= minBond
node apps/makhzan/src/cliMain.ts gate release <dealId> [--cap <capTpot>] [--live]
```

If the provider's bond is below `minBond`, preflight simulation reverts with `refusing: call would revert with BondTooLow` before any transaction is broadcast.

---

### `gate refund <dealId>`
Reclaims locked payment back to the payer (Owner) after deal default or term expiration (`block.number >= endBlock`). Signed by the recorded payer.

```bash
# Executed by the payer after endBlock or upon provider default
node apps/makhzan/src/cliMain.ts gate refund <dealId> [--cap <capTpot>] [--live]
```

If the deal is still healthy and within its term, preflight simulation reverts with `refusing: call would revert with RefundNotAllowed` before any transaction is broadcast.

---

## 2. Security & Guard Guarantees

1. **Preflight Simulation (`eth_call`):** Every mutating transaction is simulated via `eth_call`. If the contract would revert, the custom error selector is decoded (e.g. `BondTooLow`, `RefundNotAllowed`, `NotLocked`, `NotPayee`, `Expired`, `BadLock`) and the process halts with a descriptive error. No failing transactions are submitted to chain.
2. **Gas Estimation & Fee Preflight:** Gas is estimated using `eth_estimateGas` with a 1.2x safety multiplier.
3. **Spend Cap (`--cap` / `--spend-cap`):** If total estimated spend (`value + gas * gasPrice`) exceeds the user-configured cap, the command refuses before submission.
4. **Environment Isolation & `--live` Flag:**
   - On `MAKHZAN_NETWORK=live`, the explicit `--live` flag is mandatory.
   - On live runs, chain id is verified against `420420777`.
   - On live runs, the StorageGate address must match the recorded live deployment: `0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA`.
5. **Key Protection:** Private keys are never accepted on `argv` (flags like `--key`, `--private-key`, `--mnemonic` are rejected immediately). Keys are loaded exclusively from `MAKHZAN_PRIVATE_KEY` in the environment.
6. **Unit Exactness:** Amounts and bond floors must be exact multiples of `WEI_PER_UNIT` (10,000 wei). Floating-point roundoff or inexact units are refused.
7. **Durable Five-State Pipeline:** Submissions are logged to `evidence/submitted/` before receipt waits, ensuring in-flight transactions remain trackable even across network disruptions.
