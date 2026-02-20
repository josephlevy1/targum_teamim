import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getRepository } from "../lib/repository";
import { runRegionOcr, splitRegionIntoWitnessVerses } from "../lib/manuscripts-pipeline";

async function main() {
  const repo = getRepository();
  const root = path.resolve(process.cwd(), "../..");
  const calibrationDir = path.join(root, "data", "imports", "manuscripts", "calibration", "2026-02-20-synthetic");
  const pagesDir = path.join(calibrationDir, "pages");
  fs.mkdirSync(pagesDir, { recursive: true });

  const witnessId = "calibration_synthetic_p1";
  repo.upsertWitness({
    id: witnessId,
    name: "Calibration Synthetic P1",
    type: "scanned_images",
    authorityWeight: 1,
    sourcePriority: 1,
  });

  for (let i = 1; i <= 10; i += 1) {
    const pagePath = path.join(pagesDir, `${String(i).padStart(3, "0")}.png`);
    if (!fs.existsSync(pagePath)) {
      await sharp({
        create: {
          width: 1800,
          height: 2400,
          channels: 3,
          background: { r: 250, g: 250, b: 250 },
        },
      })
        .composite([
          {
            input: Buffer.from(`<svg width="1800" height="2400"><rect x="120" y="280" width="1560" height="160" fill="#d9d9d9"/><rect x="120" y="520" width="1560" height="160" fill="#d9d9d9"/><rect x="120" y="760" width="1560" height="160" fill="#d9d9d9"/></svg>`),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toFile(pagePath);
    }
  }

  const imported = repo.importPagesFromDirectory({ witnessId, directoryPath: pagesDir });
  const ocrRunnerPath = path.join(calibrationDir, "ocr-mock.sh");
  fs.writeFileSync(
    ocrRunnerPath,
    "#!/usr/bin/env bash\necho '{\"text_raw\":\"דוגמה דוגמה דוגמה\",\"mean_confidence\":0.82,\"coverage_estimate\":0.88}'\n",
    "utf8",
  );
  fs.chmodSync(ocrRunnerPath, 0o755);

  process.env.MANUSCRIPT_OCR_ENGINE = "command-json";
  process.env.MANUSCRIPT_OCR_COMMAND = ocrRunnerPath;
  process.env.MANUSCRIPT_OCR_COMMAND_ARGS = "";

  const regionIds: string[] = [];
  for (const page of imported.pages.slice(0, 10)) {
    const region = repo.upsertPageRegion({
      pageId: page.id,
      regionIndex: 1,
      bbox: { x: 120, y: 280, w: 1560, h: 640 },
      startVerseId: "Genesis:1:1",
      endVerseId: "Genesis:1:1",
      status: "ok",
      notes: "Synthetic calibration region",
    });
    regionIds.push(region.id);
  }

  const ocrResults = [] as Array<{ conf: number; coverage: number; status: string }>;
  for (const regionId of regionIds) {
    const ocr = await runRegionOcr(regionId);
    const split = await splitRegionIntoWitnessVerses(regionId);
    ocrResults.push({
      conf: ocr.ocrMeanConf,
      coverage: ocr.coverageRatioEst,
      status: split.status,
    });
  }

  const meanConf = ocrResults.reduce((sum, row) => sum + row.conf, 0) / ocrResults.length;
  const meanCoverage = ocrResults.reduce((sum, row) => sum + row.coverage, 0) / ocrResults.length;
  const partialCount = ocrResults.filter((row) => row.status === "partial").length;

  const reportPath = path.join(root, "docs", "calibration-pass-2026-02-20.md");
  const report = `# Calibration Pass Report (2026-02-20)\n\n- Dataset: synthetic 10-page manuscript calibration set\n- Witness: ${witnessId}\n- Pages processed: ${ocrResults.length}\n\n## Results\n- Mean OCR confidence: ${meanConf.toFixed(3)}\n- Mean OCR coverage estimate: ${meanCoverage.toFixed(3)}\n- Split partial count: ${partialCount}\n- Split success count: ${ocrResults.length - partialCount}\n\n## Notes\n- Flow executed end-to-end: ingest -> region annotate -> OCR -> split.\n- OCR runner used command-json mock for calibration repeatability.\n- Replace with real manuscript assets for production calibration and threshold tuning.\n`;
  fs.writeFileSync(reportPath, report, "utf8");

  console.log(JSON.stringify({
    ok: true,
    reportPath,
    pages: ocrResults.length,
    meanConf,
    meanCoverage,
    partialCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
