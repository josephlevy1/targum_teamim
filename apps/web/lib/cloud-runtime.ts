const GIB = 1024 ** 3;
const DEFAULT_R2_CUTOFF_BYTES = 9 * GIB;

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function isCloudDeployment(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export function cloudRuntimeStatus() {
  return {
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    objectStorageConfigured: Boolean(
      process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET_NAME,
    ),
    authenticationConfigured: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
  };
}

export function r2StorageCutoffBytes(): number {
  return positiveInteger(process.env.R2_STORAGE_CUTOFF_BYTES, DEFAULT_R2_CUTOFF_BYTES);
}

export class CloudStorageLimitError extends Error {
  constructor(public readonly cutoffBytes: number, public readonly attemptedBytes: number) {
    super(`Cloud storage upload rejected: ${attemptedBytes} bytes would exceed the ${cutoffBytes}-byte cutoff.`);
  }
}

/**
 * Call this immediately before each R2 write. It intentionally fails closed:
 * the application must stop accepting uploads before the provider's free-tier
 * allowance can be exceeded.
 */
export function assertCloudStorageCapacity(currentBytes: number, incomingBytes: number): void {
  if (!Number.isFinite(currentBytes) || currentBytes < 0 || !Number.isFinite(incomingBytes) || incomingBytes < 0) {
    throw new Error("Cloud storage capacity must be calculated from non-negative byte counts.");
  }

  const attemptedBytes = currentBytes + incomingBytes;
  const cutoffBytes = r2StorageCutoffBytes();
  if (attemptedBytes > cutoffBytes) {
    throw new CloudStorageLimitError(cutoffBytes, attemptedBytes);
  }
}
