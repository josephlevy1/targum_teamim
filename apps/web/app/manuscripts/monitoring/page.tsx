"use client";

import { useEffect, useMemo, useState } from "react";

type SummaryPayload = {
  generatedAt: string;
  witnesses: Array<{
    witnessId: string;
    witnessName: string;
    sourcePriority: number | null;
    ingestStatus: string;
    ocrStatus: string;
    splitStatus: string;
    confidenceStatus: string;
    pagesImported: number;
    regionsTagged: number;
    splitRows: number;
    splitPartialRows: number;
    ocrJobsFailed: number;
    rssMb: number;
    cpuPct: number;
    queueDepth: number;
    throttleState: string;
  }>;
  queues: {
    textLowConfidence: number;
    textDisagreement: number;
    textUnavailablePartial: number;
    remapAmbiguous: number;
  };
  jobs: {
    taamQueued: number;
    taamRunning: number;
    taamFailed: number;
    taamCompleted: number;
  };
};

type JobsPayload = {
  ocr: Array<{ id: string; regionId: string; status: string; attempts: number; error?: string; createdAt: string }>;
  taam: Array<{ id: string; kind: string; status: string; attempts: number; error?: string; createdAt: string }>;
};

export default function ManuscriptsMonitoringPage() {
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [jobs, setJobs] = useState<JobsPayload | null>(null);
  const [system, setSystem] = useState<any>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [summaryRes, jobsRes, systemRes] = await Promise.all([
        fetch("/api/manuscripts/monitoring/summary"),
        fetch("/api/manuscripts/monitoring/jobs?limit=50"),
        fetch("/api/manuscripts/monitoring/system"),
      ]);
      const summaryJson = (await summaryRes.json()) as SummaryPayload & { error?: string };
      const jobsJson = (await jobsRes.json()) as JobsPayload & { error?: string };
      const systemJson = (await systemRes.json()) as Record<string, unknown> & { error?: string };
      if (!summaryRes.ok) throw new Error(summaryJson.error ?? "Failed to load monitoring summary.");
      if (!jobsRes.ok) throw new Error(jobsJson.error ?? "Failed to load monitoring jobs.");
      if (!systemRes.ok) throw new Error(systemJson.error ?? "Failed to load system telemetry.");
      setSummary(summaryJson);
      setJobs(jobsJson);
      setSystem(systemJson);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Monitoring refresh failed.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [paused]);

  const alerts = useMemo(() => {
    if (!summary) return [] as string[];
    const items: string[] = [];
    if (summary.queues.textLowConfidence > 0) items.push(`Low text confidence queue: ${summary.queues.textLowConfidence}`);
    if (summary.queues.remapAmbiguous > 0) items.push(`Remap ambiguous queue: ${summary.queues.remapAmbiguous}`);
    if (summary.jobs.taamFailed > 0) items.push(`Failed ta'am jobs: ${summary.jobs.taamFailed}`);
    return items;
  }, [summary]);

  return (
    <main className="reading-main">
      <section className="panel">
        <h2>Manuscripts Monitoring</h2>
        <div className="reading-controls-row">
          <button type="button" onClick={() => setPaused((value) => !value)}>{paused ? "Resume Auto-refresh" : "Pause Auto-refresh"}</button>
          <button type="button" onClick={() => void refresh()}>Refresh now</button>
          <span className="small">Cadence: 10s</span>
        </div>
        {error ? <p className="small" style={{ color: "#dc2626" }}>{error}</p> : null}
      </section>

      <section className="panel">
        <h3>System</h3>
        <div className="small">RSS: {Number((system?.telemetry as any)?.rssMb ?? 0).toFixed(1)} MB</div>
        <div className="small">CPU: {Number((system?.telemetry as any)?.cpuPct ?? 0).toFixed(1)}%</div>
        <div className="small">Throttle: {String((system?.telemetry as any)?.throttleState ?? "unknown")}</div>
        <div className="small">
          Worker limits: OCR {Number((system?.telemetry as any)?.limits?.ocrWorkers ?? 0)}, split/remap {Number((system?.telemetry as any)?.limits?.splitRemapWorkers ?? 0)}, ta'am {Number((system?.telemetry as any)?.limits?.taamAlignWorkers ?? 0)}
        </div>
      </section>

      <section className="panel">
        <h3>Queue Health</h3>
        <div className="small">Low confidence: {summary?.queues.textLowConfidence ?? 0}</div>
        <div className="small">Disagreement: {summary?.queues.textDisagreement ?? 0}</div>
        <div className="small">Unavailable/partial: {summary?.queues.textUnavailablePartial ?? 0}</div>
        <div className="small">Remap ambiguous: {summary?.queues.remapAmbiguous ?? 0}</div>
      </section>

      <section className="panel">
        <h3>Alerts</h3>
        {alerts.length === 0 ? <div className="small">No active alerts.</div> : alerts.map((alert) => <div className="small" key={alert}>{alert}</div>)}
      </section>

      <section className="panel">
        <h3>Pipeline Status by Witness</h3>
        <div className="small" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Priority</th>
                <th>Witness</th>
                <th>Ingest</th>
                <th>OCR</th>
                <th>Split</th>
                <th>Conf</th>
                <th>Pages</th>
                <th>Split Partial</th>
                <th>OCR Failed</th>
                <th>Throttle</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.witnesses ?? []).map((w) => (
                <tr key={w.witnessId}>
                  <td>{w.sourcePriority ?? "-"}</td>
                  <td>{w.witnessName}</td>
                  <td>{w.ingestStatus}</td>
                  <td>{w.ocrStatus}</td>
                  <td>{w.splitStatus}</td>
                  <td>{w.confidenceStatus}</td>
                  <td>{w.pagesImported}</td>
                  <td>{w.splitPartialRows}</td>
                  <td>{w.ocrJobsFailed}</td>
                  <td>{w.throttleState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Job Table</h3>
        <div className="small">Ta'am jobs: queued {summary?.jobs.taamQueued ?? 0}, running {summary?.jobs.taamRunning ?? 0}, failed {summary?.jobs.taamFailed ?? 0}, completed {summary?.jobs.taamCompleted ?? 0}</div>
        <h4>OCR Jobs</h4>
        {(jobs?.ocr ?? []).slice(0, 20).map((job) => (
          <div className="small" key={job.id}>{job.createdAt} | {job.status} | attempts {job.attempts} | {job.regionId}</div>
        ))}
        <h4>Ta'am Jobs</h4>
        {(jobs?.taam ?? []).slice(0, 20).map((job) => (
          <div className="small" key={job.id}>{job.createdAt} | {job.kind} | {job.status} | attempts {job.attempts}</div>
        ))}
      </section>
    </main>
  );
}
