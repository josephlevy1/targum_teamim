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
});
