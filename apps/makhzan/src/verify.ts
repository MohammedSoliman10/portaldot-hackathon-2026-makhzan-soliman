/**
 * Read-only deployment verification: the deployed runtime code must equal the artifact byte for byte.
 * Length or a hash alone is not enough; a single changed byte is a refusal with its offset.
 */
import { keccak256, type Hex } from "viem";

export interface Comparison {
  ok: boolean;
  runtimeBytes: number;
  artifactBytes: number;
  firstDiff: number | null;
  reason?: string;
}

function normalize(value: string): string {
  const trimmed = value.trim();
  return (trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed).toLowerCase();
}

export function compareRuntime(code: string, artifactRuntime: string): Comparison {
  const runtimeBytes = normalize(code).length / 2;
  if (!artifactRuntime || normalize(artifactRuntime).length === 0) {
    return {
      ok: false, runtimeBytes, artifactBytes: 0, firstDiff: null,
      reason: "artifact has no deployedBytecode to compare",
    };
  }
  const actual = normalize(code);
  const expected = normalize(artifactRuntime);
  if (actual.length !== expected.length) {
    return {
      ok: false, runtimeBytes, artifactBytes: expected.length / 2, firstDiff: null,
      reason: `runtime length differs: chain ${runtimeBytes} B, artifact ${expected.length / 2} B`,
    };
  }
  for (let i = 0; i < actual.length; i += 2) {
    if (actual.slice(i, i + 2) !== expected.slice(i, i + 2)) {
      return {
        ok: false, runtimeBytes, artifactBytes: expected.length / 2, firstDiff: i / 2,
        reason: `runtime code differs at byte ${i / 2}: chain ${actual.slice(i, i + 2)} artifact ${expected.slice(i, i + 2)}`,
      };
    }
  }
  return { ok: true, runtimeBytes, artifactBytes: expected.length / 2, firstDiff: null };
}

export interface VerifyDeps {
  network: "local" | "live";
  chainId(): Promise<number>;
  blockNumber(): Promise<number>;
  getCode(address: string, block: number): Promise<string>;
  /** Optional Tier 0 helper; absent or reverting is recorded as not checked, never as a pass. */
  deployerOf?(address: string): Promise<string>;
}

export interface VerifyInput {
  address: string;
  artifactPath: string;
  artifactRuntime?: string;
  runtime: string;
  utc: string;
  helper?: string;
}

export interface VerifyResult {
  ok: boolean;
  record: Record<string, unknown>;
  comparison: Comparison;
}

export async function verifyDeployment(deps: VerifyDeps, input: VerifyInput): Promise<VerifyResult> {
  const block = await deps.blockNumber();
  const chainId = await deps.chainId();
  const code = await deps.getCode(input.address, block);
  const comparison = compareRuntime(code, input.artifactRuntime ?? input.runtime);
  const label = deps.network === "local" ? "LOCAL" : "LIVE";

  let deployerMapping: Record<string, unknown>;
  if (!deps.deployerOf) {
    deployerMapping = {
      checked: false,
      note: "not checked: no Tier 0 deployer helper is configured or reachable on this network",
    };
  } else {
    try {
      const deployer = await deps.deployerOf(input.address);
      deployerMapping = { checked: true, deployer, note: `helper reports the deployer as ${deployer}` };
    } catch (err) {
      deployerMapping = {
        checked: false,
        note: `not checked: the Tier 0 helper is not reachable (${(err as Error).message})`,
      };
    }
  }

  const record = {
    schema: "makhzan.verify-deployment/v0",
    network: label,
    chainId,
    address: input.address,
    block,
    utc: input.utc,
    artifact: input.artifactPath,
    match: comparison.ok,
    runtimeBytes: comparison.runtimeBytes,
    artifactBytes: comparison.artifactBytes,
    firstDiff: comparison.firstDiff,
    reason: comparison.reason ?? null,
    codeHash: keccak256((code.startsWith("0x") ? code : `0x${code}`) as Hex),
    codeVerified: {
      method: "runtime-code-hash",
      sourceVerified: false,
      artifact: input.artifactPath,
      note: comparison.ok
        ? "runtime code compared byte for byte with the artifact; no explorer source verification exists"
        : `refused: ${comparison.reason}`,
    },
    deployerMapping,
    helper: input.helper ?? null,
  };
  return { ok: comparison.ok, record, comparison };
}
