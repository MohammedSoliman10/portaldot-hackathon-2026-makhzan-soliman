import type { Hex } from "./schema";

export function sha256Hex(_bytes: Uint8Array): Promise<Hex> {
  throw new Error("not implemented");
}

export function sha256FallbackHex(_bytes: Uint8Array): Hex {
  throw new Error("not implemented");
}
