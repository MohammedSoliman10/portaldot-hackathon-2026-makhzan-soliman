/**
 * Read-only doctor: answers "can this account run the next step now?" with an exact fix per failure.
 * It never sends a transaction and never needs the private key.
 */
import { formatEther } from "viem";

export interface DoctorInput {
  network: "local" | "live";
  expectedChainId: number;
  chainId: number;
  address: string;
  contract: string;
  balanceWei: bigint;
  needsWei: bigint;
  registered: boolean;
  providerId: number;
  contractCode: string;
}

export interface DoctorLine {
  check: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

export interface DoctorReport {
  ok: boolean;
  lines: DoctorLine[];
}

export function diagnose(input: DoctorInput): DoctorReport {
  const label = input.network === "local" ? "LOCAL" : "LIVE";
  const lines: DoctorLine[] = [];

  lines.push({
    check: "network", ok: true,
    detail: `${label}, chain ${input.chainId}, account ${input.address}, contract ${input.contract || "not set"}`,
  });

  lines.push({
    check: "chain id",
    ok: input.chainId === input.expectedChainId,
    detail: `RPC reports ${input.chainId}, expected ${input.expectedChainId}`,
    ...(input.chainId === input.expectedChainId
      ? {}
      : { fix: `set MAKHZAN_CHAIN_ID=${input.expectedChainId} (the RPC is chain ${input.chainId})` }),
  });

  lines.push({
    check: "account mapping",
    ok: input.registered && input.providerId > 0,
    detail: input.registered
      ? `registered provider ${input.providerId}, bond is not read by the doctor`
      : "this account is not a registered provider",
    ...(input.registered && input.providerId > 0
      ? {}
      : { fix: `MAKHZAN_NETWORK=${input.network} MAKHZAN_PRIVATE_KEY=<key> node apps/makhzan/src/cliMain.ts register --bond <tPOT>` }),
  });

  const shortfall = input.needsWei > input.balanceWei ? input.needsWei - input.balanceWei : 0n;
  lines.push({
    check: "balance",
    ok: shortfall === 0n,
    detail:
      shortfall === 0n
        ? `balance ${formatEther(input.balanceWei)} tPOT covers ${formatEther(input.needsWei)} tPOT (existential deposit + deposits + gas)`
        : `short by ${shortfall} wei (${formatEther(shortfall)} tPOT): balance ${formatEther(input.balanceWei)} tPOT, needs ${formatEther(input.needsWei)} tPOT`,
    ...(shortfall === 0n ? {} : { fix: `fund ${input.address} with at least ${formatEther(shortfall)} tPOT` }),
  });

  lines.push({
    check: "contract code",
    ok: input.contractCode !== "" && input.contractCode !== "0x",
    detail: input.contractCode === "" || input.contractCode === "0x"
      ? `no code at ${input.contract || "(no contract configured)"}`
      : `${(input.contractCode.length - 2) / 2} B of runtime code at ${input.contract}`,
    ...(input.contractCode === "" || input.contractCode === "0x"
      ? { fix: `deploy it with MAKHZAN_NETWORK=${input.network} node scripts/deploy.mjs, then set MAKHZAN_CONTRACT` }
      : {}),
  });

  return { ok: lines.every((line) => line.ok), lines };
}

export function render(report: DoctorReport): string[] {
  return report.lines.map((line) => {
    const head = `${line.ok ? "ok" : "FAIL"}  ${line.check}: ${line.detail}`;
    return line.ok || !line.fix ? head : `${head}\n      fix: ${line.fix}`;
  });
}
