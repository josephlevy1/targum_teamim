"use client";

import React from "react";

export type DiffOp = { op: "equal" | "replace" | "insert" | "delete"; a?: string; b?: string };
export type ReplaceDetail = {
  a: string;
  b: string;
  charEditDistance: number;
  charMatchScore: number;
  charOps: DiffOp[];
};

export function WitnessDiff({ ops, replaceDetails }: { ops: DiffOp[]; replaceDetails?: Record<number, ReplaceDetail> }) {
  return (
    <div className="small witness-diff" style={{ lineHeight: 1.8 }}>
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
          <span key={idx} className="witness-diff-replace-wrap">
            <span>
              <span style={{ background: "#fee2e2", color: "#991b1b", padding: "0 0.2rem", borderRadius: 4 }}>-{op.a}</span>{" "}
              <span style={{ background: "#dcfce7", color: "#166534", padding: "0 0.2rem", borderRadius: 4 }}>+{op.b}</span>{" "}
            </span>
            {replaceDetails?.[idx] ? (
              <span className="witness-diff-char-detail">
                {replaceDetails[idx].charOps.map((charOp, charIdx) => {
                  if (charOp.op === "equal") {
                    return (
                      <span key={charIdx} className="witness-diff-char-chip">
                        {charOp.b ?? charOp.a}
                      </span>
                    );
                  }
                  if (charOp.op === "insert") {
                    return (
                      <span key={charIdx} className="witness-diff-char-chip witness-diff-char-insert">
                        +{charOp.b}
                      </span>
                    );
                  }
                  if (charOp.op === "delete") {
                    return (
                      <span key={charIdx} className="witness-diff-char-chip witness-diff-char-delete">
                        -{charOp.a}
                      </span>
                    );
                  }
                  return (
                    <span key={charIdx} className="witness-diff-char-chip witness-diff-char-replace">
                      -{charOp.a}/+{charOp.b}
                    </span>
                  );
                })}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
