# Implementation Plan: 012-ui-live-gate

## Architecture & Data Flow
1. **Build Configuration**:
   - Vercel production build environment uses `VITE_GATE_ADDRESS=0x5ee99E8AE165d0C33677C812d70B0b07820c1DCA` configured via `vercel env add VITE_GATE_ADDRESS production`.
   - Update `apps/status-ui/src/vite-env.d.ts` to include `readonly VITE_GATE_ADDRESS?: string;`.
   - Update `apps/status-ui/.env.example` to include `VITE_GATE_ADDRESS=`.
   - Add deployment record `evidence/deployments/gate-live-420420777-20261029.json` and update `evidence/addresses.json`.
2. **Component Updates**:
   - In `apps/status-ui/src/pages/Gate.tsx`: Ensure Makhzan address is linked with `<Link to="/" ...>`.
3. **Headless Verification**:
   - Run headless browser script against live RPC `https://test-evm-rpc-v3.portaldot.dev`.
   - Check deal 1 and deal 2: verify `NotLocked` verdict banner, 0px overflow, gate address, and link.
   - Save screenshots into `evidence/raw/t7/`.
4. **Integration & Gate**:
   - Run typecheck, unit tests, contracts check, secret scan, build, smoke routes.
   - Fast-forward merge to `main`.
   - Deploy to Vercel with `vercel --prod`.
   - Verify deployed site `https://status-ui-one.vercel.app`.
