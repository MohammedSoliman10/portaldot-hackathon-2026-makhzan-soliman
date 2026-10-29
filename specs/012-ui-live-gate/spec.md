# Specification: 012-ui-live-gate — Live StorageGate on Status UI

## Summary
Connect the deployed `StorageGate` contract (`0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA` on chain `420420777`) to the production Status UI deployment on `status-ui-one.vercel.app`. The gate consumer holds payment for healthy deals and releases only when the deal is healthy and within its term.

## Requirements
1. **Configuration**:
   - Provide `VITE_GATE_ADDRESS=0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA` the exact same way the four Makhzan variables are provided to the production build (Vercel Project Environment Variables).
   - Commit only the public address into documentation, types, examples, and deployment evidence. Never commit secrets or private keys.
2. **UI Updates & makhzan() Link**:
   - On `/gate`, the gate address is displayed, and the Makhzan address row provides an accessible link to `/` (the overview page for the Makhzan deployment).
3. **Real Chain Verification**:
   - Verify `/gate` against the live Portaldot testnet (chain 420420777) in headless browser at both desktop (1280×900) and mobile (390×844).
   - For deals 1 and 2, verify that the verdict banner shows `release would revert: NotLocked` (since neither deal has an active lock on this gate instance yet).
   - Verify 0px horizontal overflow at 390px.
   - Capture screenshots as evidence.
4. **Gate & Deployment**:
   - Pass full gate locally.
   - Merge `012-ui-live-gate` to `main` with fast-forward only.
   - Deploy to Vercel production from `main`.
   - Re-run deployed verification on `https://status-ui-one.vercel.app` covering `/gate`, `/replay`, `/verify`, and the mobile menu.
   - Record `CHECKPOINT-UI7.md` and report deployed commit.
