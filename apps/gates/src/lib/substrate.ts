import { ApiPromise, WsProvider } from "@polkadot/api";
import { encodeAddress } from "@polkadot/util-crypto";
import { hexToU8a, u8aToHex } from "@polkadot/util";
import type { SubmittableExtrinsic } from "@polkadot/api/types";
import type { ISubmittableResult } from "@polkadot/types/types";

export interface SubstrateConnection {
  api: ApiPromise;
  disconnect: () => Promise<void>;
}

export async function connectSubstrate(wsUrl: string): Promise<SubstrateConnection> {
  const provider = new WsProvider(wsUrl);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  return {
    api,
    disconnect: async () => {
      await api.disconnect();
    },
  };
}

export interface ChainProperties {
  ss58Prefix: number;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  raw: unknown;
}

/** Read the SS58 prefix and token properties. The prefix is never assumed. */
export async function readProperties(api: ApiPromise): Promise<ChainProperties> {
  const properties = await api.rpc.system.properties();
  const json = properties.toJSON() as Record<string, unknown>;
  const ss58 = (json.ss58Format ?? 42) as number;
  const symbols = json.tokenSymbol as string[] | string | undefined;
  const decimals = json.tokenDecimals as number[] | number | undefined;
  return {
    ss58Prefix: Number(ss58),
    tokenSymbol: Array.isArray(symbols) ? (symbols[0] ?? null) : (symbols ?? null),
    tokenDecimals: Array.isArray(decimals) ? (decimals[0] ?? null) : (decimals ?? null),
    raw: json,
  };
}

export function accountId32ToSs58(accountId32: string, prefix: number): string {
  const hex = accountId32.startsWith("0x") ? accountId32 : `0x${accountId32}`;
  const bytes = hexToU8a(hex);
  if (bytes.length !== 32) throw new Error(`expected a 32-byte AccountId, got ${bytes.length} bytes`);
  return encodeAddress(bytes, prefix);
}

export function normalizeHex32(value: string): string {
  const bytes = hexToU8a(value.startsWith("0x") ? value : `0x${value}`);
  return u8aToHex(bytes).toLowerCase();
}

export interface AccountBalances {
  free: string;
  reserved: string;
  frozen: string;
  nonce: string;
}

export async function systemAccount(api: ApiPromise, address: string): Promise<AccountBalances> {
  const account = await api.query.system.account(address);
  const json = account.toJSON() as { nonce?: number; data?: { free?: string; reserved?: string; frozen?: string } };
  return {
    nonce: String(json.nonce ?? 0),
    free: String(json.data?.free ?? "0"),
    reserved: String(json.data?.reserved ?? "0"),
    frozen: String(json.data?.frozen ?? "0"),
  };
}

/** Submit and watch one extrinsic, resolving only on inclusion; errors are surfaced verbatim. */
export async function submitAndWatch(
  api: ApiPromise,
  extrinsic: SubmittableExtrinsic<"promise", ISubmittableResult>,
  signer: string,
): Promise<{ txHash: string; blockHash: string | null }> {
  return new Promise((resolve, reject) => {
    let txHash = "";
    extrinsic
      .signAndSend(signer, (result) => {
        txHash = result.txHash.toHex();
        if (result.isError) {
          reject(new Error(`extrinsic error: ${JSON.stringify(result.toHuman())}`));
          return;
        }
        if (result.status.isInBlock || result.status.isFinalized) {
          resolve({ txHash, blockHash: result.status.isInBlock ? result.status.asInBlock.toHex() : null });
        }
      })
      .catch(reject);
  });
}
