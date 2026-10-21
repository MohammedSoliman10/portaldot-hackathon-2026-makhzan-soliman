/**
 * Provider daemon. This file currently owns the loopback upload endpoint; the polling and
 * answer half is implemented by T046/T047 (still `not implemented` below).
 */
import { createServer, type Server } from "node:http";
import { UploadReceiver, type Acknowledgement } from "./upload.ts";

/** Loopback-only HTTP endpoint: POST /upload carries one validated envelope per request. */
export function startUploadServer(receiver: UploadReceiver, port = 0): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/upload") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 8_000_000) req.destroy();
      });
      req.on("end", () => {
        try {
          const ack: Acknowledgement | undefined = receiver.accept(JSON.parse(body));
          res.writeHead(ack ? 200 : 202, { "content-type": "application/json" });
          res.end(JSON.stringify(ack ?? { accepted: true }));
        } catch (err) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/** T046/T047: the polling half. */
export interface ChainClient {
  challengeStateOf(dealId: number): Promise<{
    open: boolean;
    index: number;
    start: number;
    deadline: number;
    expectedPathLength: number;
  }>;
  answer(dealId: number, data: `0x${string}`, path: `0x${string}`[]): Promise<{ hash: `0x${string}` }>;
}

export interface PollContext {
  client: ChainClient;
  state: import("./state.ts").StateFile;
  stateFile: string;
  /** Deal ids to check even when the state has never heard of them. */
  dealIds?: number[];
  drill?: "wrong" | "skip";
}

export interface PollResult {
  answered: number[];
  skipped: number[];
  unanswerable: string[];
  unknownDeal: number[];
}

export async function pollOnce(_ctx: PollContext): Promise<PollResult> {
  throw new Error("not implemented");
}
