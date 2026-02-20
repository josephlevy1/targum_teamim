import { describe, expect, it } from "vitest";
import { deriveVaticanaManifestCandidates, parseIiifImageUrls } from "./manuscripts-vaticana";

describe("manuscripts vaticana IIIF parsing", () => {
  it("derives manifest candidates from a digi.vatlib view URL", () => {
    const candidates = deriveVaticanaManifestCandidates("https://digi.vatlib.it/view/MSS_Vat.ebr.448");
    expect(candidates.some((candidate) => candidate.includes("/iiif/MSS_Vat.ebr.448/manifest.json"))).toBe(true);
  });

  it("parses v3 manifest image URLs", () => {
    const manifest = {
      items: [
        {
          items: [
            {
              items: [
                {
                  body: {
                    id: "https://example.org/page-1/full/full/0/default.jpg",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(parseIiifImageUrls(manifest)).toEqual(["https://example.org/page-1/full/full/0/default.jpg"]);
  });

  it("parses v2 manifest image URLs", () => {
    const manifest = {
      sequences: [
        {
          canvases: [
            {
              images: [
                {
                  resource: {
                    "@id": "https://example.org/v2/page-1.jpg",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(parseIiifImageUrls(manifest)).toEqual(["https://example.org/v2/page-1.jpg"]);
  });
});
