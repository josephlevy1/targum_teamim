"use client";

import { memo } from "react";

type DiffOp = { op: "equal" | "replace" | "insert" | "delete"; a?: string; b?: string };

function WitnessDiffImpl({ ops }: { ops: DiffOp[] }) {
  return (
    <div className="small" style={{ lineHeight: 1.8 }}>
      {ops.map((op, idx) => {
        if (op.op === "equal") {
          return (
            <span key={idx} style={{ color: "#1f2937" }}>
              {op.b ?? op.a}{" "}
            </span>
          );
        }
        if (op.op === "insert") {
          return (
            <span key={idx} style={{ background: "#dcfce7", color: "#166534", padding: "0 0.2rem", borderRadius: 4 }}>
              +{op.b}{" "}
            </span>
          );
        }
        if (op.op === "delete") {
          return (
            <span key={idx} style={{ background: "#fee2e2", color: "#991b1b", padding: "0 0.2rem", borderRadius: 4 }}>
              -{op.a}{" "}
            </span>
          );
        }
        return (
          <span key={idx}>
            <span style={{ background: "#fee2e2", color: "#991b1b", padding: "0 0.2rem", borderRadius: 4 }}>-{op.a}</span>{" "}
            <span style={{ background: "#dcfce7", color: "#166534", padding: "0 0.2rem", borderRadius: 4 }}>+{op.b}</span>{" "}
          </span>
        );
      })}
    </div>
  );
}

export const WitnessDiff = memo(WitnessDiffImpl);
