"use client";

import { useEffect, useMemo, useState } from "react";

type StageStatus = "pending" | "running" | "completed" | "failed" | "blocked";

type WitnessRow = {
  witnessId: string;
  witnessName: string;
  sourcePriority: number | null;
  sourceFileName: string | null;
  sourceLink: string | null;
  ingestStatus: StageStatus;
  ocrStatus: StageStatus;
  splitStatus: StageStatus;
  confidenceStatus: StageStatus;
  runStateUpdatedAt: string;
  pagesImported: number;
  maxPageIndex: number;
  regionsTotal: number;
  regionsEligibleForOcr: number;
  regionsTagged: number;
  ocrArtifacts: number;
  ocrJobsQueued: number;
  ocrJobsRunning: number;
  ocrJobsFailed: number;
  splitRows: number;
  splitPartialRows: number;
  alignmentMeanScore: number;
  confidenceMeanScore: number;
  latestFetchStatus: "completed" | "failed" | null;
  latestFetchPageCount: number;
  latestFetchAt: string | null;
};

type DashboardPayload = {
  generatedAt: string;
  summary: {
    sources: number;
    pagesImported: number;
    regionsTagged: number;
    regionsEligibleForOcr: number;
    ocrArtifacts: number;
    ocrQueued: number;
    ocrRunning: number;
    ocrFailed: number;
    splitRows: number;
    blockedSources: number;
    completedSources: number;
  };
  witnesses: WitnessRow[];
};

const POLL_MS = 5000;

function statusColor(status: StageStatus): string {
  if (status === "completed") return "#1f7a3f";
  if (status === "running") return "#005f73";
  if (status === "blocked") return "#9b2226";
  if (status === "failed") return "#9b2226";
  return "#6a5f53";
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtTs(ts: string | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

export default function ManuscriptsDashboardPage() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch("/api/manuscripts/dashboard", { cache: "no-store" });
    const json = (await response.json()) as DashboardPayload | { error?: string };
    if (!response.ok) {
      throw new Error((json as { error?: string }).error ?? "Failed to load dashboard.");
    }
    setPayload(json as DashboardPayload);
  }

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await load();
        if (!active) return;
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to refresh dashboard.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    const timer = window.setInterval(() => {
      void run();
    }, POLL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const summary = payload?.summary;
  const rows = payload?.witnesses ?? [];

  const topLine = useMemo(() => {
    if (!payload) return "Loading...";
    return `Last refresh: ${fmtTs(payload.generatedAt)} · auto-refresh ${POLL_MS / 1000}s`;
  }, [payload]);

  return (
    <main
      style={{
        display: "block",
        height: "100dvh",
        overflow: "auto",
        padding: "1rem",
      }}
    >
      <section className="panel" style={{ marginBottom: "0.8rem" }}>
        <h2>Manuscript Import Ops Dashboard</h2>
        <div className="small">{topLine}</div>
        {error ? <div style={{ color: "#9b2226", marginTop: "0.35rem" }}>{error}</div> : null}
      </section>

      <section
        style={{
          display: "grid",
          gap: "0.6rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          marginBottom: "0.8rem",
        }}
      >
        <article className="panel"><strong>Sources</strong><div>{summary?.sources ?? "-"}</div></article>
        <article className="panel"><strong>Pages Imported</strong><div>{summary?.pagesImported ?? "-"}</div></article>
        <article className="panel"><strong>OCR Tagged/Eligible</strong><div>{summary ? `${summary.regionsTagged}/${summary.regionsEligibleForOcr}` : "-"}</div></article>
        <article className="panel"><strong>OCR Artifacts</strong><div>{summary?.ocrArtifacts ?? "-"}</div></article>
        <article className="panel"><strong>OCR Queue/Run/Fail</strong><div>{summary ? `${summary.ocrQueued}/${summary.ocrRunning}/${summary.ocrFailed}` : "-"}</div></article>
        <article className="panel"><strong>Split Rows</strong><div>{summary?.splitRows ?? "-"}</div></article>
        <article className="panel"><strong>Blocked Sources</strong><div>{summary?.blockedSources ?? "-"}</div></article>
        <article className="panel"><strong>Completed Sources</strong><div>{summary?.completedSources ?? "-"}</div></article>
      </section>

      <section className="panel" style={{ overflow: "auto" }}>
        {loading ? (
          <div>Loading sources...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.35rem" }}>Source</th>
                <th style={{ padding: "0.35rem" }}>Import</th>
                <th style={{ padding: "0.35rem" }}>OCR Prep</th>
                <th style={{ padding: "0.35rem" }}>OCR</th>
                <th style={{ padding: "0.35rem" }}>Alignment</th>
                <th style={{ padding: "0.35rem" }}>Confidence</th>
                <th style={{ padding: "0.35rem" }}>Stages</th>
                <th style={{ padding: "0.35rem" }}>Fetch</th>
                <th style={{ padding: "0.35rem" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.witnessId} style={{ borderBottom: "1px solid #efe6d8" }}>
                  <td style={{ padding: "0.35rem", whiteSpace: "nowrap" }}>
                    <div><strong>P{row.sourcePriority ?? "-"}</strong> {row.witnessId}</div>
                    <div className="small">{row.sourceFileName ?? row.sourceLink ?? "-"}</div>
                  </td>
                  <td style={{ padding: "0.35rem" }}>
                    <div>{row.pagesImported} pages</div>
                    <div className="small">max index {row.maxPageIndex}</div>
                  </td>
                  <td style={{ padding: "0.35rem" }}>
                    <div>tagged {row.regionsTagged}/{row.regionsEligibleForOcr}</div>
                    <div className="small">regions {row.regionsTotal}</div>
                  </td>
                  <td style={{ padding: "0.35rem" }}>
                    <div>done {row.ocrArtifacts}</div>
                    <div className="small">q/r/f {row.ocrJobsQueued}/{row.ocrJobsRunning}/{row.ocrJobsFailed}</div>
                  </td>
                  <td style={{ padding: "0.35rem" }}>
                    <div>rows {row.splitRows}</div>
                    <div className="small">partial {row.splitPartialRows} · mean {fmtPct(row.alignmentMeanScore)}</div>
                  </td>
                  <td style={{ padding: "0.35rem" }}>
                    <div>{fmtPct(row.confidenceMeanScore)}</div>
                  </td>
                  <td style={{ padding: "0.35rem" }}>
                    <div style={{ color: statusColor(row.ingestStatus) }}>ingest {row.ingestStatus}</div>
                    <div style={{ color: statusColor(row.ocrStatus) }}>ocr {row.ocrStatus}</div>
                    <div style={{ color: statusColor(row.splitStatus) }}>split {row.splitStatus}</div>
                    <div style={{ color: statusColor(row.confidenceStatus) }}>confidence {row.confidenceStatus}</div>
                  </td>
                  <td style={{ padding: "0.35rem" }}>
                    <div>{row.latestFetchStatus ?? "-"}</div>
                    <div className="small">pages {row.latestFetchPageCount} · {fmtTs(row.latestFetchAt)}</div>
                  </td>
                  <td style={{ padding: "0.35rem" }}>{fmtTs(row.runStateUpdatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
