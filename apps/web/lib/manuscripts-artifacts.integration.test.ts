import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { TargumRepository } from "@targum/storage";
import { createDeterministicCrop } from "./manuscripts-images";
import { runOcrWithRetry } from "./manuscripts-ocr";

describe("manuscripts crop -> OCR -> persistence", () => {
  it("persists OCR artifact from cropped region", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "manuscripts-int-test-"));
    const dbPath = path.join(root, "app.db");
    const repo = new TargumRepository({ dbPath, dataDir: root, author: "tester" });
    try {
      repo.upsertWitness({
        id: "w1",
        name: "W1",
        type: "scanned_images",
        authorityWeight: 1,
      });

      const sourceDir = path.join(root, "source");
      fs.mkdirSync(sourceDir, { recursive: true });
      const pagePath = path.join(sourceDir, "001.png");
      await sharp({
        create: {
          width: 240,
          height: 120,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toFile(pagePath);

      const imported = repo.importPagesFromDirectory({ witnessId: "w1", directoryPath: sourceDir });
      const region = repo.upsertPageRegion({
        pageId: imported.pages[0].id,
        regionIndex: 1,
        bbox: { x: 10, y: 10, w: 120, h: 60 },
        startVerseId: "Genesis:1:1",
        endVerseId: "Genesis:1:1",
      });

      const crop = await createDeterministicCrop({
        pagePath,
        bbox: region.bbox,
        outDir: path.join(root, "crops"),
        regionId: region.id,
      });

      const ocr = await runOcrWithRetry(crop.cropPath, {
        engine: "command-json",
        command: "node",
        commandArgs: ["-e", "console.log(JSON.stringify({text_raw:'abc',mean_confidence:0.71,coverage_estimate:0.44}))"],
        timeoutMs: 5000,
        maxRetries: 0,
        backoffMs: 1,
        language: "heb",
      });

      repo.upsertRegionOcrArtifact({
        regionId: region.id,
        cropPath: crop.cropPath,
        cropMetadata: crop.metadata,
        textRaw: ocr.textRaw,
        ocrMeanConf: ocr.meanConfidence,
        ocrCharCount: ocr.charCount,
        coverageRatioEst: ocr.coverageEstimate,
        engine: ocr.engine,
      });

      const stored = repo.getRegionOcrArtifact(region.id);
      expect(stored?.cropPath).toBe(crop.cropPath);
      expect(stored?.textRaw).toBe("abc");
      expect((stored?.cropMetadata as { output?: { sha256?: string } })?.output?.sha256).toBe(crop.sha256);
    } finally {
      repo.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
