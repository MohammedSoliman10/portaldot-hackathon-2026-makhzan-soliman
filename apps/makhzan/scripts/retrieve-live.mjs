/**
 * Fresh read-only retrieval client.
 *
 *   node scripts/retrieve-live.mjs --deal 1 --also-deal 2 --out <file> \
 *     --contract 0x... --rpc https://... --chain-id 420420777 --daemon http://127.0.0.1:8787
 *
 * It reads the deal root/size/leaf count from the chain, fetches the provider payload over loopback,
 * verifies every block against the on-chain root and only then writes the file. It holds no key and
 * reads no daemon state. `--tamper-test` flips one byte in an in-memory copy and must be rejected.
 */
import { writeFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { verifyFile } from "../src/retrieve.ts";

const ABI = [
  {
    type: "function",
    name: "dealOf",
    stateMutability: "view",
    inputs: [{ name: "dealId", type: "uint32" }],
    outputs: [
      { name: "owner", type: "address" }, { name: "startBlock", type: "uint32" },
      { name: "endBlock", type: "uint32" }, { name: "providerId", type: "uint16" },
      { name: "flags", type: "uint8" }, { name: "root", type: "bytes32" },
      { name: "leafCount", type: "uint24" }, { name: "size", type: "uint32" },
      { name: "challengeIndex", type: "uint32" }, { name: "challengeStart", type: "uint32" },
      { name: "price", type: "uint64" }, { name: "claimed", type: "uint64" },
    ],
  },
];

function parse(argv) {
  const options = { daemon: "http://127.0.0.1:8787", blockSize: 1024, tamperTest: false };
  const deals = [];
  const also = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--tamper-test") {
      options.tamperTest = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`option ${arg} needs a value`);
    if (arg === "--deal") deals.push(Number(value));
    else if (arg === "--also-deal") also.push(Number(value));
    else if (arg === "--out") options.out = value;
    else if (arg === "--contract") options.contract = value;
    else if (arg === "--rpc") options.rpc = value;
    else if (arg === "--chain-id") options.chainId = Number(value);
    else if (arg === "--daemon") options.daemon = value.replace(/\/$/, "");
    else if (arg === "--block-size") options.blockSize = Number(value);
    else throw new Error(`unknown option ${arg}`);
  }
  if (deals.length !== 1) throw new Error("exactly one --deal is required");
  if (!options.out) throw new Error("--out is required");
  if (!options.contract || !/^0x[0-9a-fA-F]{40}$/.test(options.contract)) throw new Error("--contract must be 20 bytes of hex");
  if (!options.rpc) throw new Error("--rpc is required");
  if (!Number.isInteger(options.chainId) || options.chainId <= 0) throw new Error("--chain-id must be positive");
  if (!Number.isInteger(options.blockSize) || options.blockSize <= 0) throw new Error("--block-size must be positive");
  options.deal = deals[0];
  options.also = also;
  return options;
}

const options = parse(process.argv.slice(2));
const client = createPublicClient({ transport: http(options.rpc) });

const chainId = await client.getChainId();
if (chainId !== options.chainId) throw new Error(`chain id ${chainId} is not ${options.chainId}`);

const readDeal = async (dealId) => {
  const d = await client.readContract({
    address: options.contract,
    abi: ABI,
    functionName: "dealOf",
    args: [dealId],
  });
  return {
    dealId,
    owner: d[0],
    providerId: Number(d[3]),
    root: d[5],
    leafCount: Number(d[6]),
    size: Number(d[7]),
  };
};

const deals = [await readDeal(options.deal), ...(await Promise.all(options.also.map(readDeal)))];
const primary = deals[0];
if (primary.root === `0x${"00".repeat(32)}`) throw new Error(`deal ${primary.dealId} has no root`);
if (primary.size <= 0 || primary.leafCount <= 0) throw new Error(`deal ${primary.dealId} has no file`);
for (const deal of deals.slice(1)) {
  if (
    deal.root.toLowerCase() !== primary.root.toLowerCase() ||
    deal.size !== primary.size ||
    deal.leafCount !== primary.leafCount
  ) {
    throw new Error(`deal ${deal.dealId} does not share the root, size and leaf count of deal ${primary.dealId}`);
  }
}

const response = await fetch(`${options.daemon}/file/${primary.root}`);
if (!response.ok) throw new Error(`provider returned HTTP ${response.status}: ${await response.text()}`);
const payload = await response.json();
const expected = {
  root: primary.root,
  size: primary.size,
  leafCount: primary.leafCount,
  blockSize: options.blockSize,
};
const verified = verifyFile(payload, expected);
writeFileSync(options.out, verified.bytes);

let tamper = null;
if (options.tamperTest) {
  const copy = JSON.parse(JSON.stringify(payload));
  const first = copy.blocks[0].data;
  const flipped = (Number.parseInt(first.slice(2, 4), 16) ^ 1).toString(16).padStart(2, "0");
  copy.blocks[0].data = `0x${flipped}${first.slice(4)}`;
  try {
    verifyFile(copy, expected);
    tamper = { rejected: false, error: null };
    process.exitCode = 1;
  } catch (err) {
    tamper = { rejected: /^ProofRejected: block 0/.test(err.message), error: err.message };
    if (!tamper.rejected) process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  schema: "makhzan.live-retrieval/v0",
  utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  chainId,
  contract: options.contract,
  provider: options.daemon,
  deals,
  blockSize: options.blockSize,
  blockCount: verified.blockCount,
  payloadBlocks: payload.blocks.length,
  sha256: verified.sha256,
  out: options.out,
  tamper,
}, null, 2));
