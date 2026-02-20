"use client";

import { useEffect, useMemo, useState } from "react";
import { WitnessDiff } from "@/components/witness-diff";

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
  artifacts: { tokenDiffOps?: Array<{ op: "equal" | "replace" | "insert" | "delete"; a?: string; b?: string }> };
};

type WitnessPayload = {
  witnesses: WitnessRow[];
  working?: { selectedSource: string; ensembleConfidence: number; flags: string[] };
};

export default function ManuscriptsReviewPage() {
  const [filter, setFilter] = useState<"low_confidence" | "disagreement" | "unavailable_partial">("low_confidence");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedVerseId, setSelectedVerseId] = useState("");
  const [payload, setPayload] = useState<WitnessPayload | null>(null);
  const [patchCursor, setPatchCursor] = useState(0);
  const [message, setMessage] = useState("");

  const selectedItem = useMemo(() => queue.find((item) => item.verseId === selectedVerseId) ?? null, [queue, selectedVerseId]);

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

  useEffect(() => {
    async function loadVerse() {
      if (!selectedVerseId) return;
      const response = await fetch(`/api/manuscripts/verse/${encodeURIComponent(selectedVerseId)}/witnesses`);
      const json = (await response.json()) as WitnessPayload & { error?: string };
      if (!response.ok) {
        setMessage(json.error ?? "Failed to load witness panel.");
        return;
      }
      setPayload(json);
    }
    void loadVerse();
  }, [selectedVerseId]);

  useEffect(() => {
    async function loadPatches() {
      if (!selectedVerseId) return;
      const response = await fetch(`/api/manuscripts/verse/${encodeURIComponent(selectedVerseId)}/patches`);
      const json = (await response.json()) as { patchCursor?: number };
      setPatchCursor(json.patchCursor ?? 0);
    }
    void loadPatches();
  }, [selectedVerseId, payload?.working?.selectedSource]);

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
    const refresh = await fetch(`/api/manuscripts/verse/${encodeURIComponent(selectedVerseId)}/witnesses`);
    setPayload((await refresh.json()) as WitnessPayload);
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

      <section className="panel">
        <h3>Witness Panel</h3>
        {selectedVerseId ? <p className="small">Verse: {selectedVerseId}</p> : null}
        {selectedItem ? (
          <p className="small">
            Selected source: {selectedItem.selectedSource}, confidence {selectedItem.ensembleConfidence.toFixed(2)}
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
        {(payload?.witnesses ?? []).map((row) => (
          <article key={row.witnessId} className="panel" style={{ marginBottom: "0.75rem" }}>
            <div className="small">
              <strong>{row.witnessId}</strong> confidence={row.sourceConfidence.toFixed(2)} clarity={row.clarityScore.toFixed(2)} match=
              {row.matchScore.toFixed(2)} completeness={row.completenessScore.toFixed(2)} status={row.status}
            </div>
            <button type="button" onClick={() => applyWitnessReading(row)}>
              Use this reading
            </button>
            <div className="small">{row.textNormalized}</div>
            <WitnessDiff ops={row.artifacts.tokenDiffOps ?? []} />
          </article>
        ))}
      </section>
    </main>
  );
}
