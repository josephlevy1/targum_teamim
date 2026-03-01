import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WitnessDiff } from "./witness-diff";

describe("WitnessDiff", () => {
  it("renders replacement char-level details when provided", () => {
    const html = renderToStaticMarkup(
      <WitnessDiff
        ops={[
          { op: "equal", a: "אב", b: "אב" },
          { op: "replace", a: "גד", b: "דה" },
        ]}
        replaceDetails={{
          1: {
            a: "גד",
            b: "דה",
            charEditDistance: 2,
            charMatchScore: 0,
            charOps: [
              { op: "replace", a: "ג", b: "ד" },
              { op: "replace", a: "ד", b: "ה" },
            ],
          },
        }}
      />,
    );

    expect(html).toContain("witness-diff-char-detail");
    expect(html).toContain("-ג/+ד");
    expect(html).toContain("-ד/+ה");
  });
});
