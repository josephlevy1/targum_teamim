import { describe, expect, it } from "vitest";
import {
  deleteRegionById,
  displayRectToImageRect,
  imageRectToDisplayRect,
  normalizeDragRect,
  upsertRegion,
} from "./manuscripts-annotator";

describe("manuscript annotator logic", () => {
  it("computes drag rectangle deterministically regardless of direction", () => {
    const a = normalizeDragRect({ x: 20, y: 30 }, { x: 100, y: 60 });
    const b = normalizeDragRect({ x: 100, y: 60 }, { x: 20, y: 30 });
    expect(a).toEqual({ x: 20, y: 30, w: 80, h: 30 });
    expect(a).toEqual(b);
  });

  it("round-trips drawn display rect to image-space bbox", () => {
    const metrics = {
      naturalWidth: 2000,
      naturalHeight: 1000,
      displayWidth: 1000,
      displayHeight: 500,
    };

    const displayRect = { x: 120, y: 75, w: 260, h: 110 };
    const imageRect = displayRectToImageRect(displayRect, metrics);
    const backToDisplay = imageRectToDisplayRect(imageRect, metrics);

    expect(imageRect).toEqual({ x: 240, y: 150, w: 520, h: 220 });
    expect(backToDisplay).toEqual(displayRect);
  });

  it("supports update/delete region operations", () => {
    const initial = [
      { id: "r1", bbox: { x: 1, y: 2, w: 3, h: 4 } },
      { id: "r2", bbox: { x: 5, y: 6, w: 7, h: 8 } },
    ];

    const updated = upsertRegion(initial, { id: "r2", bbox: { x: 9, y: 10, w: 11, h: 12 } });
    expect(updated).toHaveLength(2);
    expect(updated[1].bbox.x).toBe(9);

    const withNew = upsertRegion(updated, { id: "r3", bbox: { x: 2, y: 2, w: 2, h: 2 } });
    expect(withNew).toHaveLength(3);

    const removed = deleteRegionById(withNew, "r1");
    expect(removed.map((r) => r.id)).toEqual(["r2", "r3"]);
  });
});
