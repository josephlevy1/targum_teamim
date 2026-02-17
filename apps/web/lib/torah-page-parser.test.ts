import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChapterVersesForTest } from "./torah-pipeline";

const fixtures = path.join(process.cwd(), "tests", "fixtures");

describe("Torah page parser", () => {
  it("parses Hebrew chapter fixture", () => {
    const html = fs.readFileSync(path.join(fixtures, "hebrew_ch1_fixture.html"), "utf8");
    const verses = parseChapterVersesForTest(html, "he");
    expect(verses).toHaveLength(3);
    expect(verses[0]).toEqual({
      verse: 1,
      text: "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים׃",
    });
    expect(verses[2]?.text.includes("{פ}")).toBe(false);
  });

  it("parses Aramaic chapter fixture", () => {
    const html = fs.readFileSync(path.join(fixtures, "aramaic_ch1_fixture.html"), "utf8");
    const verses = parseChapterVersesForTest(html, "ar");
    expect(verses).toHaveLength(3);
    expect(verses[1]).toEqual({
      verse: 2,
      text: "וְאַרְעָא, הֲוָת צָדְיָא וְרֵיקָנְיָא.",
    });
  });
});
