/**
 * Evidence types for `makhzan.evidence/v0`.
 *
 * These mirror `specs/003-status-ui/contracts/evidence-schema.md` exactly. Validation lives in
 * `parseEvidence` (added with its tests); these declarations are the shared vocabulary.
 */

export type Hex = `0x${string}`;
export type EvidenceEnvironment = "anvil-local" | "portaldot-testnet";
export type DealState = "active" | "expired" | "settled";
export type RoundStatus = "pending" | "submitted" | "passed" | "failed" | "unanswered";
export type EvidenceStage = "submitted" | "included" | "executed" | "finalized" | "readBack";
export type ReceiptState = "recorded" | "not-recorded" | "unavailable-pruned" | "unavailable-error";
export type RoundOutcome = "passed" | "slashed";
export type TransactionStatus = "success" | "reverted" | "unknown";
export type Finality =
  | { kind: "tag"; tag: "finalized" }
  | { kind: "heuristic"; confirmations: number }
  | null;

export interface ChainInfo {
  chainId: number;
  name: string;
  rpcHost: string;
  explorer: string | null;
  explorerNote: string | null;
}

export interface TimingInfo {
  blockTimeSeconds: number;
  basis: "measured" | "node-default" | "assumption";
  source: string;
}

export interface DeploymentInfo {
  address: Hex;
  txHash: Hex;
  block: number | null;
  codeHash: Hex;
  runtimeBytes: number;
  creationBytes: number | null;
  compiler: string;
  codeVerified: {
    method: "runtime-code-hash" | "none";
    sourceVerified: boolean;
    artifact: string;
    note: string;
  };
}

export interface ConfigInfo {
  challengeWindowBlocks: number;
  challengeBlockSize: number;
  slashBps: number;
  minBondUnits: string;
  nextDealId: number;
  providerCount: number;
  minDurationBlocks: number;
  maxDurationBlocks: number;
  slot0: Hex;
}

export interface ProviderInfo {
  id: number;
  address: Hex;
  bondUnits: string;
  activeDeals: number;
  registered: boolean;
}

export interface DealInfo {
  id: number;
  owner: Hex;
  providerId: number;
  root: Hex;
  leafCount: number;
  size: number;
  blockSize: number;
  startBlock: number;
  endBlock: number;
  priceUnits: string;
  claimedUnits: string;
  flags: number;
  state: DealState;
  health: 0 | 1 | 2 | 3 | null;
  roundIds: number[];
}

export interface RoundInfo {
  id: number;
  dealId: number;
  outcome: RoundOutcome;
  status: RoundStatus;
  index: number;
  startBlock: number;
  deadline: number;
  expectedPathLength: number;
  challengeTx: Hex | null;
  answerTx: Hex | null;
  resolveTx: Hex | null;
  bondBeforeUnits: string;
  bondAfterUnits: string;
  slashUnits: string;
  ownerCreditWei: string;
  readBack: { challengeOpenAfter: boolean; bondAfterUnits: string };
  note: string;
}

export interface TransactionInfo {
  id: string;
  label: string;
  hash: Hex | null;
  block: number | null;
  status: TransactionStatus;
  receipt: ReceiptState;
  finality: Finality;
  stages: EvidenceStage[];
  evidence: string;
  note: string;
}

export interface RefusalInfo {
  id: string;
  attempted: string;
  error: string;
  reason: string;
  source: string;
  note: string;
}

export interface EvidenceBundle {
  schema: "makhzan.evidence/v0";
  id: string;
  environment: EvidenceEnvironment;
  label: "REPORTED";
  generatedAt: string;
  source: string;
  chain: ChainInfo;
  timing: TimingInfo;
  deployment: DeploymentInfo;
  config: ConfigInfo;
  providers: ProviderInfo[];
  deals: DealInfo[];
  rounds: RoundInfo[];
  transactions: TransactionInfo[];
  refusals: RefusalInfo[];
  limits: string[];
}

export interface EvidenceManifestEntry {
  id: string;
  url: string;
  sha256: Hex;
  environment: EvidenceEnvironment;
  generatedAt: string;
}

export interface EvidenceManifest {
  schema: "makhzan.evidence-index/v0";
  current: string;
  files: EvidenceManifestEntry[];
}

/** A loaded evidence layer. `bundle` is null only while loading or after a hard failure. */
export interface EvidenceState {
  bundle: EvidenceBundle | null;
  verified: boolean;
  error: string | null;
  loading: boolean;
}
