import { PostgresReadingRepository, TargumRepository } from "@targum/storage";
import { getDataPaths } from "../lib/config";

if (process.env.ALLOW_CLOUD_MIGRATION !== "1") {
  throw new Error("Refusing migration. Re-run with ALLOW_CLOUD_MIGRATION=1 after taking a local backup.");
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required.");
}

const { dbPath, dataDir } = getDataPaths();
const source = new TargumRepository({ dbPath, dataDir, author: "local-worker" });
const target = PostgresReadingRepository.connect(connectionString);

try {
  await target.initialize();
  const verseIds = source.listVerseIds();
  let migrated = 0;
  for (const verseId of verseIds) {
    const record = source.getVerseRecord(verseId);
    if (!record) continue;
    await target.upsertVerseRecord(record);
    migrated += 1;
    if (migrated % 100 === 0) console.log(`Migrated ${migrated}/${verseIds.length} verses`);
  }
  console.log(`Migrated ${migrated} core verse records to PostgreSQL.`);
} finally {
  source.close();
  await target.close();
}
