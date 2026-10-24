import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || "local"),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@makhzan/merkle": fileURLToPath(new URL("../makhzan/src/merkle.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["viem", "react", "react-dom"],
  },
  server: {
    fs: { allow: [repoRoot] },
    port: 5174,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
  test: {
    root: appRoot,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: ["test/**/*.browser.test.ts", "node_modules/**"],
    testTimeout: 15000,
  },
});
