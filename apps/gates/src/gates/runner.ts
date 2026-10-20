import { assertNoKeyOnArgv } from "../config.ts";
import { EvidenceError } from "../lib/evidence.ts";
import { isGateId } from "./registry.ts";

export { RawLog, writeGateRecord, exitCodeFor } from "../lib/gateIO.ts";

async function main(): Promise<void> {
  assertNoKeyOnArgv();
  const requested = process.argv[2];
  if (!requested || !isGateId(requested)) {
    console.error("usage: npm run gate -- <G01..G10>");
    process.exit(4);
  }
  const gateId = requested.toUpperCase();
  if (gateId === "G10") {
    console.error("G10 is collected by the probe daemon; finalize it with the rollup task.");
    process.exit(4);
  }

  const modulePath = `./${gateId.toLowerCase()}.ts`;
  let gateModule: { run: () => Promise<number> };
  try {
    gateModule = (await import(modulePath)) as { run: () => Promise<number> };
  } catch (error) {
    console.error(`gate ${gateId} is not implemented yet: ${(error as Error).message}`);
    process.exit(4);
  }

  try {
    const code = await gateModule.run();
    process.exit(code);
  } catch (error) {
    if (error instanceof EvidenceError) {
      console.error(`validation failed: ${error.message}`);
      process.exit(3);
    }
    console.error(`gate ${gateId} crashed: ${(error as Error).stack ?? String(error)}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
