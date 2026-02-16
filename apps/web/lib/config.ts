import fs from "node:fs";
import path from "node:path";
import type { TaamMap, TransposeConfig } from "@targum/core";

function resolveProjectRoot(): string {
  const cwd = process.cwd();
  const webSuffix = `${path.sep}apps${path.sep}web`;
  if (cwd.endsWith(webSuffix)) {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

const root = resolveProjectRoot();

export function loadTaamMap(): TaamMap {
  const file = path.join(root, "config", "taamim-map.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadTransposeConfig(): TransposeConfig {
  const file = path.join(root, "config", "layer-rules.leningrad.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function getDataPaths(): { dbPath: string; dataDir: string } {
  return {
    dbPath: path.join(root, "data", "app.db"),
    dataDir: path.join(root, "data"),
  };
}
