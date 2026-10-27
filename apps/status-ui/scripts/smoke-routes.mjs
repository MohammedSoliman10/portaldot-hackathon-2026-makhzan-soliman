#!/usr/bin/env node
/**
 * Serves `dist/` with SPA rewrites and opens every route directly, the way Vercel will.
 *
 * The point is that a judge who types `/deal/2` must get the app shell from the server, not a 404
 * and not a client-side redirect. No network, no RPC.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(appRoot, "dist");
const routes = ["/", "/deal/2", "/verify", "/proof", "/judges", "/replay", "/receipt/1", "/receipt/2"];

if (!existsSync(join(dist, "index.html"))) {
  console.error("FAIL dist/index.html is missing; run `npm run build` first");
  process.exit(1);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".bin": "application/octet-stream",
  ".svg": "image/svg+xml",
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const candidate = join(dist, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
  const isFile = existsSync(candidate) && statSync(candidate).isFile();
  const file = isFile ? candidate : join(dist, "index.html");
  response.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(response);
});

await new Promise((listening) => server.listen(0, "127.0.0.1", listening));
const { port } = server.address();
const problems = [];

for (const route of routes) {
  const url = `http://127.0.0.1:${port}${route}`;
  try {
    const response = await fetch(url);
    const body = await response.text();
    if (response.status !== 200) problems.push(`${route} answered ${response.status}`);
    if (!body.includes('id="root"')) problems.push(`${route} did not return the app root`);
    if (!body.includes("<title>Makhzan")) problems.push(`${route} did not return the Makhzan title`);
  } catch (error) {
    problems.push(`${route} failed: ${error.message}`);
  }
}

server.close();

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  process.exit(1);
}
console.log(`smoke OK: ${routes.length} routes served the shell directly`);
