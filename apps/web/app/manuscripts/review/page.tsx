"use client";

import { useEffect, useMemo, useState } from "react";
import { WitnessDiff, type ReplaceDetail } from "@/components/witness-diff";
import { sortAndFilterWitnesses, type WitnessFilter, type WitnessSort } from "@/lib/manuscripts-review-ui";

type QueueItem = {
  verseId: string;
  selectedSource: string;
  ensembleConfidence: number;
  flags: string[];
  reasonCodes: string[];
};

type WitnessRow = {
  witnessId: string;
  sourceConfidence: number;
  clarityScore: number;
  matchScore: number;
  completenessScore: number;
  status: string;
  textNormalized: string;
  artifacts: {
    tokenDiffOps?: Array<{ op: "equal" | "replace" | "insert" | "delete"; a?: string; b?: string }>;
    tokenStats?: {
      matches: number;
      replacements: number;
      inserts: number;
      deletes: number;
      alignedTokenCount: number;
    } | null;
    charStats?: {
      charEditDistance: number;
      charMatchScore: number;
    } | null;
    replaceDetails?: Record<number, ReplaceDetail>;
  };
};

type WitnessPayload = {
  verseId: string;
  baseline: { textSurface: string; textNormalized: string };
  witnesses: WitnessRow[];
  working?: {
    selectedSource: string;
    selectedTextSurface: string;
    selectedTextNormalized: string;
    ensembleConfidence: number;
    flags: string[];
    reasonCodes: string[];
  } | null;
};

export default function ManuscriptsReviewPage() {
  const [filter, setFilter] = useState<"low_confidence" | "disagreement" | "unavailable_partial">("low_confidence");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedVerseId, setSelectedVerseId] = useState("");
  const [payload, setPayload] = useState<WitnessPayload | null>(null);
  const [patchCursor, setPatchCursor] = useState(0);
  const [message, setMessage] = useState("");
  const [witnessSort, setWitnessSort] = useState<WitnessSort>("confidence");
  const [witnessFilter, setWitnessFilter] = useState<WitnessFilter>("all");

  const selectedItem = useMemo(() => queue.find((item) => item.verseId === selectedVerseId) ?? null, [queue, selectedVerseId]);

  const visibleWitnesses = useMemo(() => {
    return sortAndFilterWitnesses(payload?.witnesses ?? [], witnessSort, witnessFilter);
  }, [payload?.witnesses, witnessFilter, witnessSort]);

  useEffect(() => {
    async function loadQueue() {
      const response = await fetch(`/api/manuscripts/review-queue?filter=${encodeURIComponent(filter)}`);
      const json = (await response.json()) as { items?: QueueItem[]; error?: string };
      if (!response.ok) {
        setMessage(json.error ?? "Failed to load review queue.");
        return;
      }
      const items = json.items ?? [];
      setQueue(items);
      setSelectedVerseId((prev) => prev || items[0]?.verseId || "");
    }
    void loadQueue();
  }, [filter]);

  async function refreshVerseView(verseId: string) {
    if (!verseId) return;
    const witnessesResponse = await fetch(`/api/manuscripts/verse/${encodeURIComponent(verseId)}/witnesses`);
    const witnessesJson = (await witnessesResponse.json()) as WitnessPayload & { error?: string };
    if (!witnessesResponse.ok) {
      setMessage(witnessesJson.error ?? "Failed to load witness panel.");
      return;
    }
    setPayload(witnessesJson);

    const patchResponse = await fetch(`/api/manuscripts/verse/${encodeURIComponent(verseId)}/patches`);
    const patchJson = (await patchResponse.json()) as { patchCursor?: number; error?: string };
    if (!patchResponse.ok) {
      setMessage(patchJson.error ?? "Failed to load patch cursor.");
      return;
    }
    setPatchCursor(patchJson.patchCursor ?? 0);
  }

  useEffect(() => {
    void refreshVerseView(selectedVerseId);
  }, [selectedVerseId]);

  async function applyWitnessReading(witness: WitnessRow) {
    if (!selectedVerseId) return;
    const response = await fetch(`/api/manuscripts/verse/${encodeURIComponent(selectedVerseId)}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchType: "APPLY_WITNESS_READING",
        selectedSource: witness.witnessId,
        selectedTextSurface: witness.textNormalized,
        selectedTextNormalized: witness.textNormalized,
        ensembleConfidence: witness.sourceConfidence,
        flags: [],
        reasonCodes: ["MANUAL_SELECTION"],
      }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(json.error ?? "Failed to apply witness reading.");
      return;
    }
    setMessage(`Applied ${witness.witnessId} reading.`);
    await refreshVerseView(selectedVerseId);
  }

  async function undo() {
    if (!selectedVerseId) return;
    const response = await fetch(`/api/manuscripts/verse/${encodeURIComponent(selectedVerseId)}/undo`, { method: "POST" });
    const json = (await response.json()) as { error?: string; patchCursor?: number };
    if (!response.ok) {
      setMessage(json.error ?? "Undo failed.");
      return;
    }
    setPatchCursor(json.patchCursor ?? 0);
    setMessage("Undo applied.");
    await refreshVerseView(selectedVerseId);
  }

  async function redo() {
    if (!selectedVerseId) return;
    const response = await fetch(`/api/manuscripts/verse/${encodeURIComponent(selectedVerseId)}/redo`, { method: "POST" });
    const json = (await response.json()) as { error?: string; patchCursor?: number };
    if (!response.ok) {
      setMessage(json.error ?? "Redo failed.");
      return;
    }
    setPatchCursor(json.patchCursor ?? 0);
    setMessage("Redo applied.");
    await refreshVerseView(selectedVerseId);
  }

  return (
    <main className="reading-main">
      <section className="panel">
        <h2>Text Review Queue</h2>
        <div className="reading-controls-row">
          <label htmlFor="queue-filter">Filter</label>
          <select
            id="queue-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as "low_confidence" | "disagreement" | "unavailable_partial")}
          >
            <option value="low_confidence">Low text confidence</option>
            <option value="disagreement">Scan disagreement</option>
            <option value="unavailable_partial">Unavailable/partial scans</option>
          </select>
        </div>
        {message ? <p className="small">{message}</p> : null}
        <div className="small">
          {queue.map((item) => (
            <div key={item.verseId}>
              <button type="button" onClick={() => setSelectedVerseId(item.verseId)}>
                {item.verseId}
              </button>{" "}
              ({item.ensembleConfidence.toFixed(2)}) {item.flags.join(", ")}
            </div>
          ))}
        </div>
      </section>

      <section className="panel manuscript-review-context">
        <h3>Alignment Context</h3>
        {selectedVerseId ? <p className="small">Verse: {selectedVerseId}</p> : null}
        {selectedItem ? (
          <p className="small">
            Queue source: {selectedItem.selectedSource}, confidence {selectedItem.ensembleConfidence.toFixed(2)}
          </p>
        ) : null}
        <div className="reading-controls-row">
          <span className="small">Patch cursor: {patchCursor}</span>
          <button type="button" onClick={undo}>
            Undo
          </button>
          <button type="button" onClick={redo}>
            Redo
          </button>
        </div>
        <div className="manuscript-summary-strip">
          <div className="small">
            Working source: <strong>{payload?.working?.selectedSource ?? "baseline_digital"}</strong>
          </div>
          <div className="small">Ensemble confidence: {(payload?.working?.ensembleConfidence ?? 0).toFixed(2)}</div>
          <div className="small">Flags: {(payload?.working?.flags ?? []).join(", ") || "none"}</div>
        </div>
        <div className="manuscript-text-compare-grid">
          <div>
            <div className="small manuscript-text-label">Baseline text</div>
            <div className="small manuscript-text-block" dir="rtl">
              {payload?.baseline?.textSurface ?? ""}
            </div>
          </div>
          <div>
            <div className="small manuscript-text-label">Working selected text</div>
            <div className="small manuscript-text-block" dir="rtl">
              {payload?.working?.selectedTextSurface ?? payload?.baseline?.textSurface ?? ""}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Witness Alignment Workbench</h3>
        <div className="reading-controls-row">
          <label htmlFor="witness-sort">Sort</label>
          <select id="witness-sort" value={witnessSort} onChange={(event) => setWitnessSort(event.target.value as WitnessSort)}>
            <option value="confidence">Confidence</option>
            <option value="match">Match</option>
          </select>
          <label htmlFor="witness-filter">Filter</label>
          <select id="witness-filter" value={witnessFilter} onChange={(event) => setWitnessFilter(event.target.value as WitnessFilter)}>
            <option value="all">All</option>
            <option value="disagreement">Only disagreements</option>
            <option value="partial">Only partial/unavailable</option>
          </select>
        </div>

        {visibleWitnesses.map((row) => {
          const isAutoSelected = row.witnessId === payload?.working?.selectedSource;
          const charStats = row.artifacts?.charStats;
          const tokenStats = row.artifacts?.tokenStats;
          return (
            <article key={row.witnessId} className="panel manuscript-witness-card">
              <div className="small manuscript-witness-title-row">
                <strong>{row.witnessId}</strong>
                {isAutoSelected ? <span className="manuscript-badge manuscript-badge-selected">Auto-selected</span> : null}
                <span className={`manuscript-badge manuscript-badge-status manuscript-status-${row.status}`}>{row.status}</span>
              </div>
              <div className="small manuscript-metrics-grid">
                <span>source {row.sourceConfidence.toFixed(2)}</span>
                <span>clarity {row.clarityScore.toFixed(2)}</span>
                <span>match {row.matchScore.toFixed(2)}</span>
                <span>completeness {row.completenessScore.toFixed(2)}</span>
                <span>char match {(charStats?.charMatchScore ?? row.matchScore).toFixed(2)}</span>
                <span>char edit {charStats?.charEditDistance ?? 0}</span>
              </div>
              {tokenStats ? (
                <div className="small manuscript-metrics-grid">
                  <span>tokens {tokenStats.alignedTokenCount}</span>
                  <span>equal {tokenStats.matches}</span>
                  <span>replace {tokenStats.replacements}</span>
                  <span>insert {tokenStats.inserts}</span>
                  <span>delete {tokenStats.deletes}</span>
                </div>
              ) : null}
              <div className="reading-controls-row">
                <button type="button" onClick={() => applyWitnessReading(row)}>
                  Use this reading
                </button>
              </div>
              <div className="small manuscript-text-block" dir="rtl">
                {row.textNormalized}
              </div>
              <details>
                <summary className="small">Show alignment diff</summary>
                <WitnessDiff ops={row.artifacts?.tokenDiffOps ?? []} replaceDetails={row.artifacts?.replaceDetails as Record<number, ReplaceDetail> | undefined} />
              </details>
            </article>
          );
        })}
      </section>
    </main>
  );
}
