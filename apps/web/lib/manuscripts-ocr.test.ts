import { describe, expect, it } from "vitest";
import { parseTesseractTsv, runOcrWithRetry } from "./manuscripts-ocr";

describe("manuscripts OCR runner", () => {
  it("parses tesseract tsv confidence and coverage", () => {
    const tsv = [
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      "5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t87.5\tאב",
      "5\t1\t1\t1\t1\t2\t20\t0\t10\t10\t75.0\tגד",
    ].join("\n");

    const parsed = parseTesseractTsv(tsv);
    expect(parsed.meanConfidence).toBeGreaterThan(0.8);
    expect(parsed.coverageEstimate).toBeGreaterThan(0.9);
  });

  it("runs command-json OCR engine", async () => {
    const result = await runOcrWithRetry("/tmp/input.png", {
      engine: "command-json",
      command: "node",
      commandArgs: ["-e", "console.log(JSON.stringify({text_raw:'sample',mean_confidence:0.66,coverage_estimate:0.4}))"],
      timeoutMs: 5000,
      maxRetries: 0,
      backoffMs: 1,
      language: "heb",
    });
    expect(result.engine).toBe("command-json");
    expect(result.textRaw).toBe("sample");
    expect(result.meanConfidence).toBeCloseTo(0.66);
  });
});
