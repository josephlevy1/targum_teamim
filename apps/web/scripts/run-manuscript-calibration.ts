import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { getRepository } from "../lib/repository";
import { runRegionOcr, splitRegionIntoWitnessVerses } from "../lib/manuscripts-pipeline";

function ensureCommand(cmd: string) {
  const check = spawnSync(cmd, ["--version"], { encoding: "utf8" });
  if (check.error || check.status !== 0) {
    throw new Error(`${cmd} is required for calibration run but was not found.`);
  }
}

function pickCalibrationPdfs(root: string, count = 10): string[] {
  const csv = fs.readFileSync(path.join(root, "book_sources", "book_list.csv"), "utf8");
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = lines.slice(1).map((line) => line.split(",").map((part) => part.trim()));
  const sorted = rows
    .filter((cols) => cols.length >= 6 && cols[2] && cols[2] !== "NA")
    .sort((a, b) => Number(a[5]) - Number(b[5]));

  const selected: string[] = [];
  for (const row of sorted) {
    const candidate = path.join(root, "book_sources", row[2]);
    if (fs.existsSync(candidate)) selected.push(candidate);
    if (selected.length >= count) break;
  }

  if (selected.length === 0) {
    throw new Error("No local PDF found in /book_sources for calibration.");
  }

  return selected;
}

function rasterizePdfFirstPages(pdfPaths: string[], outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const output: string[] = [];
  for (let i = 0; i < pdfPaths.length; i += 1) {
    const outPath = path.join(outDir, `${String(i + 1).padStart(3, "0")}.png`);
    const run = spawnSync("sips", ["-s", "format", "png", pdfPaths[i], "--out", outPath], {
      encoding: "utf8",
    });
    if (run.status !== 0 || !fs.existsSync(outPath)) {
      throw new Error(`sips failed to convert ${pdfPaths[i]}: ${run.stderr || "unknown error"}`);
    }
    output.push(outPath);
  }
  return output;
}

async function main() {
  ensureCommand("sips");
  const repo = getRepository();
  const root = path.resolve(process.cwd(), "../..");
  const calibrationDir = path.join(root, "data", "imports", "manuscripts", "calibration", "2026-02-20-book-sources");
  const pagesDir = path.join(calibrationDir, "pages");
  fs.mkdirSync(pagesDir, { recursive: true });

  const sourcePdfs = pickCalibrationPdfs(root, 10);
  const rasterizedPages = rasterizePdfFirstPages(sourcePdfs, pagesDir);
  if (rasterizedPages.length < 10) {
    throw new Error(`Expected at least 10 rasterized pages, found ${rasterizedPages.length}.`);
  }

  const witnessId = "calibration_book_sources_p1";
  repo.upsertWitness({
    id: witnessId,
    name: "Calibration Book Sources P1",
    type: "scanned_images",
    authorityWeight: 1,
    sourcePriority: 1,
  });

  const imported = repo.importPagesFromDirectory({ witnessId, directoryPath: pagesDir });
  const hasTesseract = spawnSync("tesseract", ["--version"], { encoding: "utf8" }).status === 0;
  if (hasTesseract) {
    process.env.MANUSCRIPT_OCR_ENGINE = "tesseract";
    process.env.MANUSCRIPT_OCR_COMMAND = "tesseract";
    process.env.MANUSCRIPT_OCR_LANG = process.env.MANUSCRIPT_OCR_LANG || "heb";
    process.env.MANUSCRIPT_OCR_COMMAND_ARGS = "";
  } else {
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
  }

  const regionIds: string[] = [];
  for (const page of imported.pages.slice(0, 10)) {
    const meta = await sharp(page.imagePath).metadata();
    const width = Number(meta.width ?? 0);
    const height = Number(meta.height ?? 0);
    if (!width || !height) {
      throw new Error(`Could not read dimensions for ${page.imagePath}`);
    }
    const region = repo.upsertPageRegion({
      pageId: page.id,
      regionIndex: 1,
      bbox: {
        x: Math.max(0, Math.round(width * 0.08)),
        y: Math.max(0, Math.round(height * 0.12)),
        w: Math.max(20, Math.round(width * 0.84)),
        h: Math.max(20, Math.round(height * 0.64)),
      },
      startVerseId: "Genesis:1:1",
      endVerseId: "Genesis:1:1",
      status: "ok",
      notes: "Book-source calibration region",
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
  const report = `# Calibration Pass Report (2026-02-20)\n\n- Dataset: local PDFs from /book_sources (first page from each selected PDF)\n- Source PDFs:\n${sourcePdfs.map((pdf) => `  - ${path.basename(pdf)}`).join("\n")}\n- Witness: ${witnessId}\n- OCR engine: ${hasTesseract ? "tesseract" : "command-json-mock"}\n- Pages processed: ${ocrResults.length}\n\n## Results\n- Mean OCR confidence: ${meanConf.toFixed(3)}\n- Mean OCR coverage estimate: ${meanCoverage.toFixed(3)}\n- Split partial count: ${partialCount}\n- Split success count: ${ocrResults.length - partialCount}\n\n## Notes\n- Flow executed end-to-end: ingest -> region annotate -> OCR -> split.\n- Input pages were derived from local /book_sources PDFs (no network fetch).\n`;
  fs.writeFileSync(reportPath, report, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        reportPath,
        pages: ocrResults.length,
        meanConf,
        meanCoverage,
        partialCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
