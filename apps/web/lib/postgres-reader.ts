import { PostgresReadingRepository } from "@targum/storage";
import { databaseUrl } from "./cloud-runtime";

let reader: PostgresReadingRepository | null = null;

export function getPostgresReadingRepository(): PostgresReadingRepository {
  if (!reader) {
    const connectionString = databaseUrl();
    if (!connectionString) throw new Error("PostgreSQL is not configured for this deployment.");
    reader = PostgresReadingRepository.connect(connectionString);
  }
  return reader;
}
