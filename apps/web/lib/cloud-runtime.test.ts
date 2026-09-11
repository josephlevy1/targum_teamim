import { describe, expect, it } from "vitest";
import { CloudStorageLimitError, assertCloudStorageCapacity } from "./cloud-runtime";

describe("assertCloudStorageCapacity", () => {
  it("allows uploads below the default free-tier cutoff", () => {
    expect(() => assertCloudStorageCapacity(8 * 1024 ** 3, 512 * 1024 ** 2)).not.toThrow();
  });

  it("rejects uploads that would exceed the default cutoff", () => {
    expect(() => assertCloudStorageCapacity(9 * 1024 ** 3, 1)).toThrow(CloudStorageLimitError);
  });
});
