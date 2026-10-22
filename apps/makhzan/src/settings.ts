/** Environment settings for the CLI and daemon. */
import type { Hex } from "viem";

export interface Settings {
  network: "local" | "live";
  rpcUrl: string;
  chainId: number;
  contract: Hex;
  key: Hex;
  stateDir: string;
  daemonPort: number;
  pollMs: number;
  daemonUrl: string;
}

export function loadSettings(_env: NodeJS.ProcessEnv): Settings {
  throw new Error("not implemented");
}
