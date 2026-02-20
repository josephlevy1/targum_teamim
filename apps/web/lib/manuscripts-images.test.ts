import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createDeterministicCrop, normalizeBbox } from "./manuscripts-images";

describe("manuscripts image pipeline", () => {
  it("normalizes pixel and normalized bbox", () => {
    const pixel = normalizeBbox({ x: 10, y: 20, w: 30, h: 40 }, { width: 100, height: 200 });
    expect(pixel.pixel.x).toBe(10);
    const normalized = normalizeBbox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, { width: 100, height: 200 });
    expect(normalized.pixel).toEqual({ x: 10, y: 40, w: 30, h: 80 });
  });

  it("creates deterministic crop hash across repeated runs", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "manuscript-image-test-"));
    try {
      const imagePath = path.join(root, "page.png");
      const cropDir = path.join(root, "crops");
      await sharp({
        create: {
          width: 120,
          height: 120,
          channels: 3,
          background: { r: 220, g: 220, b: 220 },
        },
      })
        .png()
        .toFile(imagePath);

      const first = await createDeterministicCrop({
        pagePath: imagePath,
        bbox: { x: 10, y: 10, w: 50, h: 40 },
        outDir: cropDir,
        regionId: "r1",
      });
      const second = await createDeterministicCrop({
        pagePath: imagePath,
        bbox: { x: 10, y: 10, w: 50, h: 40 },
        outDir: cropDir,
        regionId: "r1",
      });

      expect(first.sha256).toBe(second.sha256);
      expect(first.metadata.output).toBeTruthy();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
