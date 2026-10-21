/** Validated upload receiver: one block per request, acknowledged only when the file is complete. */
import type { Hex } from "./merkle.ts";

export interface UploadConfig {
  blockSize: number;
  storeDir?: string;
}

export interface Acknowledgement {
  root: Hex;
  size: number;
  leafCount: number;
}

export class UploadReceiver {
  constructor(_config: UploadConfig) {
    throw new Error("not implemented");
  }

  /** Validates an untrusted envelope; returns the acknowledgement once the root is confirmed. */
  accept(_envelope: unknown): Acknowledgement | undefined {
    throw new Error("not implemented");
  }
}
