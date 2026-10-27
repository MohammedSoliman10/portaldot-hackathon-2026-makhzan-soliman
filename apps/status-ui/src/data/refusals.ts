/**
 * Read-only refusals: the calls a non-owner, a non-provider and a bad-params caller get rejected.
 *
 * Every entry is encoded for `eth_call` only. Nothing here signs, sends or pays: the page calls the
 * contract with a fixed caller address and reads back the revert data, then decodes the four-byte
 * selector with the error fragments below — the same fragments `contracts/src/makhzan/IMakhzan.sol`
 * declares. The selector table is derived from those fragments at import time, never typed by hand.
 */
import { decodeAbiParameters, encodeFunctionData, keccak256, parseAbi, toBytes } from "viem";
import type { AbiParameter } from "viem";
import type { Hex } from "./schema";

/** The shape of an `error` fragment, so the decoder can accept any ABI's errors. */
export interface ErrorFragment {
  type: "error";
  name: string;
  inputs: readonly AbiParameter[];
}

/** The burn address: not the deal owner, not provider 1, and not ours. */
export const REFUSAL_CALLER: Hex = "0x000000000000000000000000000000000000dEaD";

/** The write fragments, used only to build calldata for `eth_call`. */
export const REFUSAL_ABI = parseAbi([
  "function challenge(uint32 dealId)",
  "function answer(uint32 dealId, bytes data, bytes32[] path)",
  "function createDeal(uint16 providerId, bytes32 root, uint24 leafCount, uint32 size, uint32 durationBlocks, uint64 price) payable",
]);

/** Every custom error `IMakhzan.sol` declares, copied field for field. */
export const ERROR_ABI = parseAbi([
  "error NotRegistered()",
  "error AlreadyRegistered()",
  "error BondTooSmall()",
  "error HasOpenDeal()",
  "error NoDeal()",
  "error NotOwner()",
  "error NotProvider()",
  "error BadParams()",
  "error DealExpired()",
  "error ChallengeOpen()",
  "error NoChallenge()",
  "error ProofRejected()",
  "error WindowOpen()",
  "error ZeroClaim()",
  "error AlreadySettled()",
  "error BeforeEnd()",
  "error TransferFailed()",
  "error NotImplemented()",
]);

/** Canonical signature of a fragment: `Name(type,type)`. */
export function signatureOf(fragment: { name: string; inputs: readonly AbiParameter[] }): string {
  return `${fragment.name}(${fragment.inputs.map((input) => input.type).join(",")})`;
}

/** The four-byte selector: the first four bytes of keccak256 over the canonical signature. */
export function selectorOf(signature: string): Hex {
  return keccak256(toBytes(signature)).slice(0, 10) as Hex;
}

/** selector → canonical signature, built once from the ABI fragments. */
export const ERROR_SELECTORS: ReadonlyMap<Hex, string> = new Map(
  ERROR_ABI.map((fragment) => [selectorOf(signatureOf(fragment)), signatureOf(fragment)] as const),
);

export interface DecodedRefusal {
  selector: Hex | null;
  name: string | null;
  signature: string | null;
  args: readonly unknown[] | null;
  note: string;
}

/**
 * Decodes revert data against the ABI. An unknown selector stays visible and is never renamed to
 * something plausible: the page shows the raw selector and says it is not in the ABI.
 */
export function decodeRefusal(
  data: Hex | null | undefined,
  abi: readonly ErrorFragment[] = ERROR_ABI,
): DecodedRefusal {
  const text = typeof data === "string" ? data.trim() : "";
  if (!/^0x[0-9a-fA-F]{8,}$/.test(text)) {
    return {
      selector: null,
      name: null,
      signature: null,
      args: null,
      note: `no four-byte selector in the returned data (${text === "" ? "empty" : text})`,
    };
  }
  const selector = text.slice(0, 10).toLowerCase() as Hex;
  const fragment = abi.find((item) => selectorOf(signatureOf(item)) === selector);
  if (fragment === undefined) {
    return {
      selector,
      name: null,
      signature: null,
      args: null,
      note: `selector ${selector} is not in the ABI we decode with`,
    };
  }
  const signature = signatureOf(fragment);
  let args: readonly unknown[] = [];
  if (fragment.inputs.length > 0) {
    const tail = text.slice(10);
    args = tail.length === 0 ? [] : decodeAbiParameters(fragment.inputs, `0x${tail}`);
  }
  return {
    selector,
    name: fragment.name,
    signature,
    args,
    note: `decoded from the ABI: ${signature}`,
  };
}

export type RefusalId = "non-owner-challenge" | "non-provider-answer" | "bad-params-create";

interface RefusalCallBase {
  title: string;
  description: string;
  /** The first check the contract runs, quoted from the source. */
  expectedCheck: string;
}

export type RefusalCall =
  | (RefusalCallBase & { id: "non-owner-challenge"; functionName: "challenge"; args: readonly [number] })
  | (RefusalCallBase & {
      id: "non-provider-answer";
      functionName: "answer";
      args: readonly [number, Hex, readonly Hex[]];
    })
  | (RefusalCallBase & {
      id: "bad-params-create";
      functionName: "createDeal";
      args: readonly [number, Hex, number, number, number, bigint];
    });

/** The three refusals, in the order the page shows them. */
export const REFUSAL_CALLS: readonly RefusalCall[] = [
  {
    id: "non-owner-challenge",
    title: "Challenge as a non-owner",
    description:
      "Only the deal owner may open a challenge. The burn address calls challenge(1) on deal 1, which is settled.",
    functionName: "challenge",
    args: [1],
    expectedCheck: "if (msg.sender != d.owner) revert NotOwner();",
  },
  {
    id: "non-provider-answer",
    title: "Answer as a non-provider",
    description:
      "Only the deal's provider may answer. The burn address calls answer(1, 0x, []) with no block and no path.",
    functionName: "answer",
    args: [1, "0x", []],
    expectedCheck: "if (msg.sender != providers[d.providerId - 1].addr) revert NotProvider();",
  },
  {
    id: "bad-params-create",
    title: "Create a deal with bad params",
    description:
      "A zero root, zero size, zero leaves and zero price cannot become a deal. The burn address calls createDeal with all of them zero.",
    functionName: "createDeal",
    args: [1, `0x${"00".repeat(32)}`, 0, 0, 0, 0n],
    expectedCheck: "if (root == bytes32(0) || size == 0 || leafCount == 0 || price == 0) revert BadParams();",
  },
];

/** The calldata for one refusal call, encoded from the fragment list above. */
export function calldataFor(call: RefusalCall): Hex {
  if (call.id === "non-owner-challenge") {
    return encodeFunctionData({ abi: REFUSAL_ABI, functionName: "challenge", args: call.args });
  }
  if (call.id === "non-provider-answer") {
    return encodeFunctionData({ abi: REFUSAL_ABI, functionName: "answer", args: call.args });
  }
  return encodeFunctionData({ abi: REFUSAL_ABI, functionName: "createDeal", args: call.args });
}
