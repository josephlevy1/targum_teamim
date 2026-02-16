import { TargumRepository } from "@targum/storage";
import { getDataPaths } from "./config";

let repository: TargumRepository | null = null;

export function getRepository(): TargumRepository {
  if (!repository) {
    const { dbPath, dataDir } = getDataPaths();
    repository = new TargumRepository({
      dbPath,
      dataDir,
      author: process.env.USER ?? "local-user",
    });
  }

  return repository;
}
