import type { ConfigInfo, Hex } from "./schema";

export type PeekConfig = Omit<ConfigInfo, "slot0">;

export function decodeSlot0(_value: Hex): PeekConfig {
  throw new Error("not implemented");
}
