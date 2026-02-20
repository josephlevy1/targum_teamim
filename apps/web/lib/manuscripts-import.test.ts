import { describe, expect, it } from "vitest";
import { authorityWeightForPriority, witnessIdForSource, VATICAN_EBR19_WITNESS_ID, VATICAN_VETUS_WITNESS_ID } from "./manuscripts-import";

describe("manuscripts import mapping", () => {
  it("maps vaticana priorities to fixed witness IDs", () => {
    expect(
      witnessIdForSource({
        referenceName: "Biblia Vetus Testamentum Pentateuchus",
        link: "https://digi.vatlib.it/view/MSS_Vat.ebr.448",
        fileName: "NA",
        location: "Spain",
        year: 1200,
        priority: 1,
      }),
    ).toBe(VATICAN_VETUS_WITNESS_ID);

    expect(
      witnessIdForSource({
        referenceName: "Vat.ebr.19",
        link: "https://digi.vatlib.it/view/MSS_Vat.ebr.19",
        fileName: "NA",
        location: "North Africa",
        year: 1500,
        priority: 2,
      }),
    ).toBe(VATICAN_EBR19_WITNESS_ID);
  });

  it("maps hebrewbooks file names to numeric witness IDs", () => {
    const witnessId = witnessIdForSource({
      referenceName: "Lisbon 45803",
      link: "https://www.hebrewbooks.org/45803",
      fileName: "Hebrewbooks_org_45803.pdf",
      location: "Lisbon",
      year: 1491,
      priority: 3,
    });

    expect(witnessId).toBe("hebrewbooks_45803");
  });

  it("derives descending authority weights by priority", () => {
    expect(authorityWeightForPriority(1)).toBe(1);
    expect(authorityWeightForPriority(2)).toBe(0.95);
    expect(authorityWeightForPriority(12)).toBeGreaterThanOrEqual(0.5);
  });
});
