import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FAVICON_FILES = [
  "favicon.ico",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon-48x48.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
];

describe("Favicon set and head links", () => {
  it("has all 7 favicon files in public directory", () => {
    const publicDir = resolve(__dirname, "../public");
    for (const file of FAVICON_FILES) {
      const filePath = resolve(publicDir, file);
      expect(existsSync(filePath), `Expected ${file} to exist in public/`).toBe(true);
    }
  });

  it("links favicons and sets theme-color in index.html head", () => {
    const indexPath = resolve(__dirname, "../index.html");
    const html = readFileSync(indexPath, "utf8");

    // Must link .ico, 16x16 PNG, 32x32 PNG, apple-touch-icon, and theme-color
    expect(html).toMatch(/<link\s+[^>]*href=["']\/favicon\.ico["'][^>]*>/);
    expect(html).toMatch(/<link\s+[^>]*href=["']\/favicon-16x16\.png["'][^>]*>/);
    expect(html).toMatch(/<link\s+[^>]*href=["']\/favicon-32x32\.png["'][^>]*>/);
    expect(html).toMatch(/<link\s+[^>]*href=["']\/apple-touch-icon\.png["'][^>]*>/);
    expect(html).toMatch(/<meta\s+name=["']theme-color["']\s+content=["']#000000["']\s*\/?>/);
  });
});
