# Third-Party Dependencies and Licences

This project relies on the following third-party software, libraries, and frameworks across its contracts, client tools, agent server, and web user interface.

## 1. Contracts & Foundry Tooling

| Component | Repository / Source | Version / Commit | Licence | Purpose |
| --- | --- | --- | --- | --- |
| **Foundry** (`forge`, `cast`, `anvil`) | [foundry-rs/foundry](https://github.com/foundry-rs/foundry) | 1.8.5 | MIT / Apache-2.0 | Contract compilation, unit testing, fuzzing, invariant testing, local anvil chain |
| **forge-std** | [foundry-rs/forge-std](https://github.com/foundry-rs/forge-std) | 1.17.0 (`f3dae6e`) | MIT OR Apache-2.0 | Foundry test assertions, standard cheats, console logging |
| **Solidity Compiler** (`solc`) | [ethereum/solidity](https://github.com/ethereum/solidity) | 0.8.28 | GPL-3.0 | Compiling Makhzan and StorageGate contracts with `via_ir = true` |
| **resolc** | [paritytech/revive](https://github.com/paritytech/revive) | 1.4.0 | Apache-2.0 | PolkaVM compilation probe (Tier-0 compiler test only) |

## 2. Core Storage Client & Daemon (`apps/makhzan`)

Defined in [`apps/makhzan/package.json`](apps/makhzan/package.json):

| Package | Version | Licence | Purpose |
| --- | --- | --- | --- |
| **viem** | 2.57.7 | MIT | Ethereum JSON-RPC client, ABI parsing, contract calls, transaction encoding |
| **typescript** | 5.9.3 | Apache-2.0 | Type checking and compilation |
| **@types/node** | 24.19.2 | MIT | TypeScript definitions for Node.js |

## 3. Read-Only MCP Agent Server (`apps/makhzan-mcp`)

Defined in [`apps/makhzan-mcp/package.json`](apps/makhzan-mcp/package.json):

| Package | Version | Licence | Purpose |
| --- | --- | --- | --- |
| **@modelcontextprotocol/sdk** | 1.32.2 | MIT | Official Model Context Protocol TypeScript SDK for JSON-RPC 2.0 stdio server |
| **viem** | 2.57.7 | MIT | Read-only chain queries (`eth_call`, `eth_chainId`, `eth_blockNumber`) |
| **zod** | 4.6.7 | MIT | Input schema validation for MCP tools |
| **typescript** | 5.9.3 | Apache-2.0 | Type checking and compilation |
| **@types/node** | 24.19.2 | MIT | TypeScript definitions for Node.js |

## 4. Gates & Chain Diagnostics (`apps/gates`)

Defined in [`apps/gates/package.json`](apps/gates/package.json):

| Package | Version | Licence | Purpose |
| --- | --- | --- | --- |
| **@polkadot/api** | 17.0.2 | Apache-2.0 | Substrate RPC client for node diagnostics, block headers, pallet metadata |
| **@polkadot/util** | 14.0.3 | Apache-2.0 | Substrate utility functions, number conversions, buffer utilities |
| **@polkadot/util-crypto** | 14.0.3 | Apache-2.0 | Substrate cryptography, SS58 address formatting |
| **viem** | 2.57.7 | MIT | EVM client for parallel EVM/Substrate balance reconciliation |
| **typescript** | 5.9.3 | Apache-2.0 | Type checking and compilation |
| **@types/node** | 24.19.2 | MIT | TypeScript definitions for Node.js |

## 5. Web Status UI (`apps/status-ui`)

Defined in [`apps/status-ui/package.json`](apps/status-ui/package.json):

| Package | Version | Licence | Purpose |
| --- | --- | --- | --- |
| **react** | 19.2.9 | MIT | User interface rendering |
| **react-dom** | 19.2.9 | MIT | React DOM renderer |
| **react-router-dom** | ^7.18.4 | MIT | Client-side routing for Overview, Deals, Proof, Verify, Replay, Gate, Judges |
| **viem** | 2.57.7 | MIT | Read-only EVM client for browser live verification and chain queries |
| **tailwindcss** | ^4.1.14 | MIT | Utility-first CSS styling framework |
| **@tailwindcss/vite** | ^4.1.14 | MIT | Vite plugin for Tailwind CSS v4 |
| **@fontsource-variable/space-grotesk** | ^5.2.8 | OFL-1.1 | Space Grotesk open font typography |
| **@fontsource/ibm-plex-mono** | ^5.2.6 | OFL-1.1 | IBM Plex Mono open font typography |
| **vite** | ^7.3.7 | MIT | Fast frontend build tool and dev server |
| **vitest** | ^4.1.12 | MIT | Unit and component test runner |
| **jsdom** | ^26.1.0 | MIT | DOM simulation for component tests |
| **@testing-library/react** | ^16.3.3 | MIT | React component testing utilities |
| **@testing-library/dom** | (transitive) | MIT | DOM testing primitives |
| **@testing-library/jest-dom** | ^6.9.1 | MIT | Custom jest-dom matchers for assertions |
| **@testing-library/user-event** | ^14.6.8 | MIT | User interaction simulation for tests |
| **@vitejs/plugin-react** | ^5.2.0 | MIT | React support plugin for Vite |
| **typescript** | 5.9.3 | Apache-2.0 | TypeScript compiler and type checking |
| **@types/react** | ^19.2.0 | MIT | TypeScript definitions for React |
| **@types/react-dom** | ^19.2.0 | MIT | TypeScript definitions for React DOM |
| **@types/node** | ^24.19.2 | MIT | TypeScript definitions for Node.js |

## 6. Specification & Workflow Tools

| Component | Source | Version | Licence | Purpose |
| --- | --- | --- | --- | --- |
| **GitHub Spec Kit** (`specify-cli`) | [github/spec-kit](https://github.com/github/spec-kit) | v1.2.2 | MIT | Feature specification, memory contracts, and implementation plan templates |
