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

/** T046/T047: poll challenges for known deals and answer them. */
export function pollOnce(_receiver: UploadReceiver, _client: unknown): Promise<void> {
  throw new Error("not implemented");
}
