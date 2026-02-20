import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readBookSources } from "./book-sources";

describe("book source priority list", () => {
  it("loads sources sorted by priority from book_list.csv", () => {
    const sources = readBookSources();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0].priority).toBe(1);
    expect(sources[0].referenceName).toContain("Biblia");
    expect(sources[1].priority).toBe(2);
  });

  it("falls back to embedded priority list when CSV file is unavailable", () => {
    const cwd = process.cwd();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "book-sources-fallback-"));
    try {
      process.chdir(tempDir);
      const sources = readBookSources();
      expect(sources.length).toBeGreaterThan(0);
      expect(sources[0].priority).toBe(1);
      expect(sources.at(-1)?.priority).toBe(12);
    } finally {
      process.chdir(cwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
