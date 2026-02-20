"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Witness = {
  id: string;
  name: string;
  type: "scanned_images" | "ocr_text" | "digital_text";
  authorityWeight: number;
  sourcePriority: number | null;
  sourceLink: string | null;
  sourceFileName: string | null;
};

type Page = {
  id: string;
  imagePath: string;
  pageIndex: number;
  status: "ok" | "partial" | "unavailable" | "failed";
  thumbnailPath: string | null;
  quality: Record<string, unknown>;
};

type Region = {
  id: string;
  pageId: string;
  regionIndex: number;
  bbox: { x: number; y: number; w: number; h: number };
  startVerseId: string | null;
  endVerseId: string | null;
  status: "ok" | "partial" | "unavailable" | "failed";
};

type GateSnapshot = {
  witness: Witness;
  runState: {
    ingestStatus: string;
    ocrStatus: string;
    splitStatus: string;
    confidenceStatus: string;
    blockers: Array<{ detail: string; reasonCode: string }>;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function ManuscriptsPage() {
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [gateSnapshots, setGateSnapshots] = useState<GateSnapshot[]>([]);
  const [selectedWitnessId, setSelectedWitnessId] = useState("");
  const [selectedPageId, setSelectedPageId] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [progress, setProgress] = useState<{ pagesAnnotated: number; totalPages: number; regionsPendingOcr: number } | null>(null);
  const [directoryPath, setDirectoryPath] = useState("");
  const [startVerseId, setStartVerseId] = useState("");
  const [endVerseId, setEndVerseId] = useState("");
  const [status, setStatus] = useState<"ok" | "partial" | "unavailable" | "failed">("ok");
  const [bboxX, setBboxX] = useState("0");
  const [bboxY, setBboxY] = useState("0");
  const [bboxW, setBboxW] = useState("100");
  const [bboxH, setBboxH] = useState("100");
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [pipelineVerseId, setPipelineVerseId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);

  const selectedWitness = useMemo(() => witnesses.find((w) => w.id === selectedWitnessId) ?? null, [selectedWitnessId, witnesses]);
  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedPageId) ?? null, [pages, selectedPageId]);
  const selectedGate = useMemo(
    () => gateSnapshots.find((snapshot) => snapshot.witness.id === selectedWitnessId) ?? null,
    [gateSnapshots, selectedWitnessId],
  );

  async function loadWitnesses() {
    const response = await fetch("/api/manuscripts/witnesses");
    const payload = (await response.json()) as { witnesses?: Witness[]; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to load witnesses.");
      return;
    }
    const next = payload.witnesses ?? [];
    setWitnesses(next);
    if (!selectedWitnessId && next[0]?.id) setSelectedWitnessId(next[0].id);
  }

  async function loadGateSnapshots() {
    const response = await fetch("/api/manuscripts/sources");
    const payload = (await response.json()) as { gating?: GateSnapshot[]; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to load source gate state.");
      return;
    }
    setGateSnapshots(payload.gating ?? []);
  }

  async function loadPages(witnessId: string) {
    if (!witnessId) return;
    const response = await fetch(`/api/manuscripts/pages?witnessId=${encodeURIComponent(witnessId)}`);
    const payload = (await response.json()) as { pages?: Page[]; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to load pages.");
      return;
    }
    const nextPages = payload.pages ?? [];
    setPages(nextPages);
    if (!selectedPageId && nextPages[0]?.id) setSelectedPageId(nextPages[0].id);
  }

  async function loadRegions(pageId: string) {
    if (!pageId) return;
    const response = await fetch(`/api/manuscripts/regions?pageId=${encodeURIComponent(pageId)}`);
    const payload = (await response.json()) as { regions?: Region[]; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to load regions.");
      return;
    }
    setRegions(payload.regions ?? []);
  }

  async function loadProgress(witnessId: string) {
    if (!witnessId) return;
    const response = await fetch(`/api/manuscripts/progress?witnessId=${encodeURIComponent(witnessId)}`);
    const payload = (await response.json()) as {
      progress?: { pagesAnnotated: number; totalPages: number; regionsPendingOcr: number };
      error?: string;
    };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to load progress.");
      return;
    }
    setProgress(payload.progress ?? null);
  }

  useEffect(() => {
    void loadWitnesses();
    void loadGateSnapshots();
  }, []);

  useEffect(() => {
    void loadPages(selectedWitnessId);
    void loadProgress(selectedWitnessId);
    void loadGateSnapshots();
  }, [selectedWitnessId]);

  useEffect(() => {
    void loadRegions(selectedPageId);
  }, [selectedPageId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const editable = tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target?.isContentEditable;
      if (editable) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const idx = pages.findIndex((page) => page.id === selectedPageId);
        if (idx >= 0 && idx < pages.length - 1) setSelectedPageId(pages[idx + 1].id);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const idx = pages.findIndex((page) => page.id === selectedPageId);
        if (idx > 0) setSelectedPageId(pages[idx - 1].id);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRegion();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pages, selectedPageId, bboxX, bboxY, bboxW, bboxH, status, startVerseId, endVerseId, regions]);

  function regionToDisplayRect(region: Region): { left: number; top: number; width: number; height: number } | null {
    const img = imageRef.current;
    if (!img) return null;
    const naturalWidth = img.naturalWidth || 1;
    const naturalHeight = img.naturalHeight || 1;
    const displayWidth = img.clientWidth || 1;
    const displayHeight = img.clientHeight || 1;

    return {
      left: (region.bbox.x / naturalWidth) * displayWidth,
      top: (region.bbox.y / naturalHeight) * displayHeight,
      width: (region.bbox.w / naturalWidth) * displayWidth,
      height: (region.bbox.h / naturalHeight) * displayHeight,
    };
  }

  function updateBboxFromDisplayRect(rect: { x: number; y: number; w: number; h: number }) {
    const img = imageRef.current;
    if (!img) return;
    const displayWidth = img.clientWidth || 1;
    const displayHeight = img.clientHeight || 1;
    const naturalWidth = img.naturalWidth || 1;
    const naturalHeight = img.naturalHeight || 1;

    const scaleX = naturalWidth / displayWidth;
    const scaleY = naturalHeight / displayHeight;
    setBboxX(String(Math.round(rect.x * scaleX)));
    setBboxY(String(Math.round(rect.y * scaleY)));
    setBboxW(String(Math.round(rect.w * scaleX)));
    setBboxH(String(Math.round(rect.h * scaleY)));
  }

  function onOverlayPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!imageRef.current) return;
    const container = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - container.left, 0, container.width);
    const y = clamp(event.clientY - container.top, 0, container.height);
    setDrawStart({ x, y });
    setDraftRect({ x, y, w: 0, h: 0 });
  }

  function onOverlayPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawStart) return;
    const container = event.currentTarget.getBoundingClientRect();
    const cx = clamp(event.clientX - container.left, 0, container.width);
    const cy = clamp(event.clientY - container.top, 0, container.height);
    const x = Math.min(drawStart.x, cx);
    const y = Math.min(drawStart.y, cy);
    const w = Math.abs(cx - drawStart.x);
    const h = Math.abs(cy - drawStart.y);
    setDraftRect({ x, y, w, h });
  }

  function onOverlayPointerUp() {
    if (draftRect && draftRect.w > 5 && draftRect.h > 5) {
      updateBboxFromDisplayRect(draftRect);
    }
    setDrawStart(null);
    setDraftRect(null);
  }

  async function syncBookListWitnesses() {
    setBusy(true);
    setMessage("Syncing witnesses from book_list.csv...");
    const response = await fetch("/api/manuscripts/witnesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync_book_list" }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Sync failed.");
      setBusy(false);
      return;
    }
    await loadWitnesses();
    await loadGateSnapshots();
    setMessage("Witnesses synced from prioritized source list.");
    setBusy(false);
  }

  async function importPages() {
    if (!selectedWitnessId || !directoryPath.trim()) {
      setMessage("Select a witness and provide a source directory.");
      return;
    }
    setBusy(true);
    setMessage("Importing pages...");
    const response = await fetch("/api/manuscripts/pages/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ witnessId: selectedWitnessId, directoryPath: directoryPath.trim() }),
    });
    const payload = (await response.json()) as {
      imported?: number;
      summary?: { ok: number; partial: number; unavailable: number; failed: number };
      blockers?: Array<{ detail: string }>;
      error?: string;
    };
    if (!response.ok) {
      if (payload.blockers?.length) {
        setMessage(`Import blocked: ${payload.blockers[0].detail}`);
      } else {
        setMessage(payload.error ?? "Import failed.");
      }
      setBusy(false);
      return;
    }
    await loadPages(selectedWitnessId);
    await loadProgress(selectedWitnessId);
    await loadGateSnapshots();
    const summary = payload.summary;
    setMessage(
      `Imported ${payload.imported ?? 0} files${summary ? ` (ok:${summary.ok} partial:${summary.partial} unavailable:${summary.unavailable} failed:${summary.failed})` : ""}.`,
    );
    setBusy(false);
  }

  function loadRegionIntoEditor(region: Region) {
    setEditingRegionId(region.id);
    setStartVerseId(region.startVerseId ?? "");
    setEndVerseId(region.endVerseId ?? "");
    setStatus(region.status);
    setBboxX(String(region.bbox.x));
    setBboxY(String(region.bbox.y));
    setBboxW(String(region.bbox.w));
    setBboxH(String(region.bbox.h));
  }

  async function saveRegion() {
    if (!selectedPageId) {
      setMessage("Select a page before saving a region.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/manuscripts/regions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingRegionId ?? undefined,
        pageId: selectedPageId,
        regionIndex: editingRegionId ? regions.find((r) => r.id === editingRegionId)?.regionIndex ?? regions.length + 1 : regions.length + 1,
        bbox: { x: Number(bboxX), y: Number(bboxY), w: Number(bboxW), h: Number(bboxH) },
        startVerseId: startVerseId.trim() || null,
        endVerseId: endVerseId.trim() || null,
        status,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to save region.");
      setBusy(false);
      return;
    }
    setEditingRegionId(null);
    await loadRegions(selectedPageId);
    await loadProgress(selectedWitnessId);
    setMessage("Region saved.");
    setBusy(false);
  }

  async function deleteRegion(regionId: string) {
    setBusy(true);
    const response = await fetch(`/api/manuscripts/regions/${encodeURIComponent(regionId)}`, { method: "DELETE" });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Delete failed.");
      setBusy(false);
      return;
    }
    if (editingRegionId === regionId) setEditingRegionId(null);
    await loadRegions(selectedPageId);
    await loadProgress(selectedWitnessId);
    setMessage("Region deleted.");
    setBusy(false);
  }

  async function runOcr(regionId: string) {
    setBusy(true);
    const response = await fetch("/api/manuscripts/ocr/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regionId }),
    });
    const payload = (await response.json()) as { error?: string; blockers?: Array<{ detail: string }> };
    if (!response.ok) {
      setMessage(payload.blockers?.[0]?.detail ?? payload.error ?? "OCR failed.");
      setBusy(false);
      return;
    }
    await loadProgress(selectedWitnessId);
    await loadGateSnapshots();
    setMessage(`OCR completed for ${regionId}.`);
    setBusy(false);
  }

  async function splitRegion(regionId: string) {
    setBusy(true);
    const response = await fetch(`/api/manuscripts/regions/${encodeURIComponent(regionId)}/split`, { method: "POST" });
    const payload = (await response.json()) as { error?: string; blockers?: Array<{ detail: string }> };
    if (!response.ok) {
      setMessage(payload.blockers?.[0]?.detail ?? payload.error ?? "Split failed.");
      setBusy(false);
      return;
    }
    await loadGateSnapshots();
    setMessage(`Split completed for ${regionId}.`);
    setBusy(false);
  }

  async function recomputeConfidenceAndCascade() {
    if (!pipelineVerseId.trim()) {
      setMessage("Provide verse_id for confidence/cascade recompute.");
      return;
    }
    setBusy(true);
    const confidence = await fetch("/api/manuscripts/confidence/recompute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verseId: pipelineVerseId.trim(), witnessId: selectedWitnessId }),
    });
    const confidencePayload = (await confidence.json()) as { error?: string; blockers?: Array<{ detail: string }> };
    if (!confidence.ok) {
      setMessage(confidencePayload.blockers?.[0]?.detail ?? confidencePayload.error ?? "Confidence recompute failed.");
      setBusy(false);
      return;
    }
    const cascade = await fetch("/api/manuscripts/cascade/recompute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verseId: pipelineVerseId.trim(), witnessId: selectedWitnessId }),
    });
    const cascadePayload = (await cascade.json()) as { error?: string; blockers?: Array<{ detail: string }> };
    if (!cascade.ok) {
      setMessage(cascadePayload.blockers?.[0]?.detail ?? cascadePayload.error ?? "Cascade recompute failed.");
      setBusy(false);
      return;
    }
    await loadGateSnapshots();
    setMessage(`Confidence + cascade recomputed for ${pipelineVerseId.trim()}.`);
    setBusy(false);
  }

  return (
    <main className="reading-main">
      <section className="panel">
        <h2>Manuscript Import</h2>
        <p className="small">Priority follows book_sources/book_list.csv (P1 → P12). Use arrow keys for page nav, Ctrl/Cmd+S to save region.</p>
        {message ? <p className="small">{message}</p> : null}

        <div className="reading-controls-row">
          <button type="button" onClick={syncBookListWitnesses} disabled={busy}>
            Sync Witnesses From book_list.csv
          </button>
        </div>

        <div className="reading-controls-row">
          <label htmlFor="witness-select">Witness</label>
          <select id="witness-select" value={selectedWitnessId} onChange={(event) => setSelectedWitnessId(event.target.value)} disabled={busy}>
            {witnesses.map((witness) => (
              <option key={witness.id} value={witness.id}>
                P{witness.sourcePriority ?? "-"} {witness.name}
              </option>
            ))}
          </select>
        </div>

        <div className="reading-controls-row">
          <label htmlFor="directory-path">Directory Path</label>
          <input
            id="directory-path"
            type="text"
            value={directoryPath}
            onChange={(event) => setDirectoryPath(event.target.value)}
            placeholder="/absolute/path/to/page/files"
            disabled={busy}
          />
          <button type="button" onClick={importPages} disabled={busy}>
            Import Pages
          </button>
        </div>

        <div className="reading-controls-row">
          <label htmlFor="page-select">Page</label>
          <select id="page-select" value={selectedPageId} onChange={(event) => setSelectedPageId(event.target.value)} disabled={busy}>
            <option value="">Select page</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                Page {page.pageIndex} ({page.status})
              </option>
            ))}
          </select>
        </div>
        {progress ? (
          <p className="small">
            Progress: {progress.pagesAnnotated}/{progress.totalPages} pages annotated, {progress.regionsPendingOcr} regions pending OCR.
          </p>
        ) : null}

        {selectedGate ? (
          <div className="small" style={{ marginTop: "0.5rem" }}>
            <div>Gate states: ingest={selectedGate.runState.ingestStatus} ocr={selectedGate.runState.ocrStatus} split={selectedGate.runState.splitStatus} confidence={selectedGate.runState.confidenceStatus}</div>
            {selectedGate.runState.blockers.length > 0 ? <div>Blocker: {selectedGate.runState.blockers[0].detail}</div> : null}
          </div>
        ) : null}

        <div className="reading-controls-row">
          <label htmlFor="pipeline-verse-id">Verse for confidence/cascade</label>
          <input
            id="pipeline-verse-id"
            type="text"
            placeholder="Genesis:1:1"
            value={pipelineVerseId}
            onChange={(event) => setPipelineVerseId(event.target.value)}
          />
          <button type="button" onClick={recomputeConfidenceAndCascade} disabled={busy}>
            Recompute Confidence + Cascade
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>Draw Region Annotator</h3>
        <div className="reading-controls-row">
          <label htmlFor="start-verse">Start verse_id</label>
          <input id="start-verse" type="text" value={startVerseId} onChange={(event) => setStartVerseId(event.target.value)} />
        </div>
        <div className="reading-controls-row">
          <label htmlFor="end-verse">End verse_id</label>
          <input id="end-verse" type="text" value={endVerseId} onChange={(event) => setEndVerseId(event.target.value)} />
        </div>
        <div className="reading-controls-row">
          <label htmlFor="region-status">Status</label>
          <select id="region-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="ok">ok</option>
            <option value="partial">partial</option>
            <option value="unavailable">unavailable</option>
            <option value="failed">failed</option>
          </select>
        </div>
        <div className="reading-controls-row">
          <label htmlFor="bbox-x">BBox x y w h</label>
          <input id="bbox-x" value={bboxX} onChange={(event) => setBboxX(event.target.value)} />
          <input value={bboxY} onChange={(event) => setBboxY(event.target.value)} />
          <input value={bboxW} onChange={(event) => setBboxW(event.target.value)} />
          <input value={bboxH} onChange={(event) => setBboxH(event.target.value)} />
          <button type="button" onClick={saveRegion} disabled={busy}>
            {editingRegionId ? "Update Region" : "Save Region"}
          </button>
        </div>

        <div className="annotator-wrap">
          {selectedPage && selectedPage.imagePath.match(/\.(png|jpg|jpeg|webp|tif|tiff)$/i) ? (
            <div
              className="annotator-canvas"
              onPointerDown={onOverlayPointerDown}
              onPointerMove={onOverlayPointerMove}
              onPointerUp={onOverlayPointerUp}
              onPointerLeave={onOverlayPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imageRef} src={selectedPage.imagePath} alt={`Page ${selectedPage.pageIndex}`} className="annotator-image" />
              {regions.map((region) => {
                const rect = regionToDisplayRect(region);
                if (!rect) return null;
                return (
                  <button
                    key={region.id}
                    type="button"
                    className={`annotator-region ${editingRegionId === region.id ? "active" : ""}`}
                    style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
                    onClick={() => loadRegionIntoEditor(region)}
                  >
                    <span className="handle tl" />
                    <span className="handle tr" />
                    <span className="handle bl" />
                    <span className="handle br" />
                    <span className="annotator-region-label">#{region.regionIndex}</span>
                  </button>
                );
              })}
              {draftRect ? (
                <div className="annotator-draft" style={{ left: draftRect.x, top: draftRect.y, width: draftRect.w, height: draftRect.h }} />
              ) : null}
            </div>
          ) : (
            <p className="small">Select an image page to draw rectangles.</p>
          )}
        </div>

        {regions.length > 0 ? (
          <div className="small">
            {regions.map((region) => (
              <div key={region.id} style={{ marginTop: "0.35rem" }}>
                #{region.regionIndex} [{region.status}] {region.startVerseId ?? "-"} to {region.endVerseId ?? "-"} bbox({region.bbox.x},{region.bbox.y},{region.bbox.w},{region.bbox.h})
                <button type="button" onClick={() => loadRegionIntoEditor(region)} disabled={busy} style={{ marginLeft: "0.4rem" }}>
                  Edit
                </button>
                <button type="button" onClick={() => deleteRegion(region.id)} disabled={busy} style={{ marginLeft: "0.3rem" }}>
                  Delete
                </button>
                <button type="button" onClick={() => runOcr(region.id)} disabled={busy} style={{ marginLeft: "0.3rem" }}>
                  Run OCR
                </button>
                <button type="button" onClick={() => splitRegion(region.id)} disabled={busy} style={{ marginLeft: "0.3rem" }}>
                  Split to Verses
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="small">No regions saved for selected page.</p>
        )}
      </section>

      <section className="panel">
        <h3>Witness Details + Pages</h3>
        {selectedWitness ? (
          <div className="small" style={{ marginBottom: "0.6rem" }}>
            <div>ID: {selectedWitness.id}</div>
            <div>Priority: {selectedWitness.sourcePriority ?? "N/A"}</div>
            <div>Authority weight: {selectedWitness.authorityWeight}</div>
            <div>Type: {selectedWitness.type}</div>
            <div>
              Source link:{" "}
              {selectedWitness.sourceLink ? (
                <a href={selectedWitness.sourceLink} target="_blank" rel="noreferrer">
                  {selectedWitness.sourceLink}
                </a>
              ) : (
                "N/A"
              )}
            </div>
          </div>
        ) : null}

        {pages.length === 0 ? <p className="small">No pages imported yet.</p> : null}
        {pages.map((page) => (
          <article key={page.id} className="panel" style={{ marginBottom: "0.75rem" }}>
            <div className="small">
              <strong>Page {page.pageIndex}</strong> ({page.status})
            </div>
            <div className="small">{page.imagePath}</div>
            {page.thumbnailPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.thumbnailPath} alt={`Thumbnail ${page.pageIndex}`} style={{ maxWidth: "100%", marginTop: "0.35rem" }} />
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
