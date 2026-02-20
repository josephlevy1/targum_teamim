import { describe, expect, it } from "vitest";
import { ensureTesseractRuntime, parseImportArgs, shouldStopBatch } from "./manuscripts-import-runner";

describe("manuscripts import runner helpers", () => {
  it("parses cli args with defaults", () => {
    const args = parseImportArgs(["--witness=vatican_vetus_p1"]);
    expect(args.witnessId).toBe("vatican_vetus_p1");
    expect(args.mode).toBe("calibration");
    expect(args.pageCount).toBe(20);
    expect(args.startPage).toBe(1);
  });

  it("enforces OCR stop condition thresholds for batch mode", () => {
    const stop = shouldStopBatch({
      mode: "batch",
      ocrCompleted: 80,
      ocrFailed: 20,
      splitSuccess: 60,
      splitPartial: 30,
    });
    expect(stop.stop).toBe(true);
    expect(stop.reasons.length).toBeGreaterThan(0);
  });

  it("accepts healthy batch metrics", () => {
    const stop = shouldStopBatch({
      mode: "batch",
      ocrCompleted: 90,
      ocrFailed: 10,
      splitSuccess: 80,
      splitPartial: 20,
    });
    expect(stop.stop).toBe(false);
  });

  it("validates tesseract + heb through injected spawn", () => {
    const spawn = ((cmd: string, args: string[]) => {
      if (cmd === "tesseract" && args[0] === "--version") {
        return { status: 0, stdout: "tesseract 5", stderr: "", error: undefined };
      }
      if (cmd === "tesseract" && args[0] === "--list-langs") {
        return { status: 0, stdout: "List of available languages\nheb\neng\n", stderr: "", error: undefined };
      }
      return { status: 1, stdout: "", stderr: "bad", error: undefined };
    }) as any;

    expect(() => ensureTesseractRuntime(spawn)).not.toThrow();
  });
});
