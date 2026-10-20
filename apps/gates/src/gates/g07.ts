import { privateKeyToAccount } from "viem/accounts";
import { BURNERS, CHAIN, getBurnerKey, loadConfig } from "../config.ts";
import type { GateRecord } from "../lib/evidence.ts";
import { getEvmBalance, publicClientFor } from "../lib/evm.ts";
import { accountId32ToSs58, connectSubstrate, readProperties, systemAccount } from "../lib/substrate.ts";
import { candidateAAccountId32 } from "../keygen.ts";
import { RawLog, writeGateRecord, exitCodeFor } from "../lib/gateIO.ts";

export interface BurnerView {
  role: string;
  envName: string;
  evm: string;
  accountId32: string;
  ss58: string;
  native: { free: string; reserved: string; frozen: string; nonce: string };
  evmBalanceWei: string;
}

/** Factor between native planck and EVM wei, derived from two observed balances. */
export function impliedFactor(
  nativeBalance: bigint,
  evmBalance: bigint,
  nativeDecimals = 14,
  evmDecimals = 18,
): string {
  if (nativeBalance <= 0n) throw new Error("native balance must be greater than zero");
  const numerator = evmBalance * 10n ** BigInt(nativeDecimals);
  const denominator = nativeBalance * 10n ** BigInt(evmDecimals);
  const scaled = (numerator * 1_000_000n) / denominator;
  const whole = scaled / 1_000_000n;
  const fraction = (scaled % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function nativeToEvm(nativeBalance: bigint, factor: number | string): bigint {
  const [whole, fraction = ""] = String(factor).split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || "0");
  return (nativeBalance * numerator) / denominator;
}

export function workedExample(
  nativeAmount: bigint,
  factor: number | string,
): { native: string; evm: string; sentValue: string; receivedValue: string } {
  const evm = nativeToEvm(nativeAmount, factor);
  return { native: nativeAmount.toString(), evm: evm.toString(), sentValue: evm.toString(), receivedValue: evm.toString() };
}

export function mappingOutcome(input: {
  attempted: boolean;
  evmBalance: bigint;
  evmTransferOk?: boolean;
}): "PASS" | "FAIL" | "blocked" {
  if (!input.attempted) return "blocked";
  if (input.evmBalance === 0n) return "FAIL";
  if (input.evmTransferOk === false) return "FAIL";
  return "PASS";
}

interface MetadataSummary {
  specName: string;
  specVersion: string;
  ss58Prefix: number;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  reviveCalls: string[];
  reviveStorage: string[];
  reviveConstants: string[];
  reviveConstantValues: Record<string, unknown>;
}

async function inspectMetadata(api: Awaited<ReturnType<typeof connectSubstrate>>["api"]): Promise<MetadataSummary> {
  const version = api.runtimeVersion;
  const properties = await readProperties(api);
  const tx = api.tx as unknown as Record<string, Record<string, unknown> | undefined>;
  const query = api.query as unknown as Record<string, Record<string, unknown> | undefined>;
  const consts = api.consts as unknown as Record<string, Record<string, unknown> | undefined>;
  return {
    specName: version.specName.toString(),
    specVersion: version.specVersion.toString(),
    ss58Prefix: properties.ss58Prefix,
    tokenSymbol: properties.tokenSymbol,
    tokenDecimals: properties.tokenDecimals,
    reviveCalls: Object.keys(tx.revive ?? {}).sort(),
    reviveStorage: Object.keys(query.revive ?? {}).sort(),
    reviveConstants: Object.keys(consts.revive ?? {}).sort(),
    reviveConstantValues: Object.fromEntries(
      ["autoMap", "nativeToEthRatio", "chainId", "allowEVMBytecode", "depositPerByte"].map((name) => {
        const value = consts.revive?.[name] as { toJSON?: () => unknown } | undefined;
        return [name, typeof value?.toJSON === "function" ? value.toJSON() : (value ?? null)];
      }),
    ),
  };
}

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function run(): Promise<number> {
  const startedAt = new Date();
  const config = loadConfig();
  const raw = await RawLog.create("G07");

  const accounts = BURNERS.map((spec) => {
    const account = privateKeyToAccount(getBurnerKey(spec.role) as `0x${string}`);
    return {
      role: spec.role,
      envName: spec.envName,
      evm: account.address.toLowerCase(),
      accountId32: candidateAAccountId32(account.address),
    };
  });

  const addressPath = await raw.write(
    "addresses",
    `${accounts.map((account) => `${account.role} evm=${account.evm} accountId32=${account.accountId32}`).join("\n")}\n`,
  );

  let ss58Prefix = 42;
  let metadata: MetadataSummary | null = null;
  let views: BurnerView[] = [];
  let chainId: string | null = null;
  let failure: string | null = null;
  let connection: Awaited<ReturnType<typeof connectSubstrate>> | null = null;

  try {
    connection = await connectSubstrate(config.wsUrl);
    metadata = await inspectMetadata(connection.api);
    ss58Prefix = metadata.ss58Prefix;
    const client = publicClientFor(config.evmRpcUrl);
    chainId = String(await client.getChainId());

    for (const account of accounts) {
      const ss58 = accountId32ToSs58(account.accountId32, ss58Prefix);
      const native = await systemAccount(connection.api, ss58);
      const evmBalanceWei = (await getEvmBalance(client, account.evm as `0x${string}`)).toString();
      views.push({ ...account, ss58, native, evmBalanceWei });
    }
  } catch (error) {
    failure = `${(error as Error).name}: ${(error as Error).message}`;
  } finally {
    await connection?.disconnect().catch(() => undefined);
  }

  const balancePath = await raw.write(
    "balances",
    `${views.map((view) => `${view.role} ss58=${view.ss58} free=${view.native.free} evmWei=${view.evmBalanceWei}`).join("\n") || "no balances observed"}\n`,
  );
  const metadataPath = await raw.write("metadata", `${JSON.stringify(metadata ?? { error: failure }, null, 2)}\n`);

  const finishedAt = new Date();
  const allZeroNative = views.length > 0 && views.every((view) => view.native.free === "0");
  const reason = failure
    ? `chain read failed: ${failure}`
    : "funds not requested by instruction; T023 not started, owner funding pending";

  const record: GateRecord = {
    schemaVersion: 1,
    gateId: "G07",
    runState: "blocked",
    verdict: null,
    reason,
    startedAt: stamp(startedAt),
    finishedAt: stamp(finishedAt),
    endpoint: config.evmRpcUrl,
    chainIdObserved: chainId,
    commands: [
      {
        command: "node src/gates/runner.ts G07",
        cwd: "apps/gates",
        exitCode: 2,
        rawOutput: raw.relative(metadataPath),
        ranAt: stamp(startedAt),
      },
    ],
    measurements: [],
    transactions: [],
    errors: failure ? [{ stage: "g07-phase-1", message: failure, at: stamp(finishedAt) }] : [],
    verdictReason: null,
    classification: null,
    adaptation: null,
    evidenceFiles: [addressPath, balancePath, metadataPath].map((path) => raw.relative(path)),
    details: {
      derivation: "secp256k1 -> viem privateKeyToAccount address; candidate A = EVM bytes + twelve 0xEE",
      ss58Prefix,
      chain: CHAIN,
      metadata,
      accounts: views,
      allZeroNative,
      candidates: {
        a: {
          rule: "20-byte EVM address followed by twelve 0xEE bytes",
          status: "assumed; not yet funded",
          evmBalanceWei: views.map((view) => view.evmBalanceWei),
        },
        b: {
          rule: "separate Substrate keypair + pallet_revive.map_account",
          status: "not attempted; only if evidence disproves A after funding",
        },
      },
      faucetAddress: views.find((view) => view.role === "owner")?.ss58 ?? null,
    },
  };

  const recordPath = await writeGateRecord(record);

  for (const view of views) {
    console.log(`${view.role.padEnd(11)} evm=${view.evm} ss58=${view.ss58} free=${view.native.free}`);
  }
  console.log(`ss58Prefix=${ss58Prefix} tokenSymbol=${metadata?.tokenSymbol} tokenDecimals=${metadata?.tokenDecimals}`);
  console.log(`record=${recordPath}`);
  if (failure) console.error(`blocked: ${failure}`);
  return exitCodeFor(record);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await run());
}
