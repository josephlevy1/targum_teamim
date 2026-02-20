"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function ManuscriptsPage() {
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
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
  const [pipelineVerseId, setPipelineVerseId] = useState("");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedWitness = useMemo(
    () => witnesses.find((w) => w.id === selectedWitnessId) ?? null,
    [selectedWitnessId, witnesses],
  );
  const selectedPage = useMemo(() => pages.find((page) => page.id === selectedPageId) ?? null, [pages, selectedPageId]);

  async function loadWitnesses() {
    const response = await fetch("/api/manuscripts/witnesses");
    const payload = (await response.json()) as { witnesses?: Witness[]; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Failed to load witnesses.");
      return;
    }
    const next = payload.witnesses ?? [];
    setWitnesses(next);
    if (!selectedWitnessId && next[0]?.id) {
      setSelectedWitnessId(next[0].id);
    }
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
    if (!selectedPageId && nextPages[0]?.id) {
      setSelectedPageId(nextPages[0].id);
    }
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
  }, []);

  useEffect(() => {
    void loadPages(selectedWitnessId);
    void loadProgress(selectedWitnessId);
  }, [selectedWitnessId]);

  useEffect(() => {
    void loadRegions(selectedPageId);
  }, [selectedPageId]);

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
    const payload = (await response.json()) as { imported?: number; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Import failed.");
      setBusy(false);
      return;
    }
    await loadPages(selectedWitnessId);
    await loadProgress(selectedWitnessId);
    setMessage(`Imported ${payload.imported ?? 0} files.`);
    setBusy(false);
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
        pageId: selectedPageId,
        regionIndex: regions.length + 1,
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
    await loadRegions(selectedPageId);
    await loadProgress(selectedWitnessId);
    setMessage("Region saved.");
    setBusy(false);
  }

  async function runOcr(regionId: string) {
    setBusy(true);
    const response = await fetch("/api/manuscripts/ocr/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regionId }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "OCR failed.");
      setBusy(false);
      return;
    }
    setMessage(`OCR completed for ${regionId}.`);
    setBusy(false);
  }

  async function splitRegion(regionId: string) {
    setBusy(true);
    const response = await fetch(`/api/manuscripts/regions/${encodeURIComponent(regionId)}/split`, {
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Split failed.");
      setBusy(false);
      return;
    }
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
      body: JSON.stringify({ verseId: pipelineVerseId.trim() }),
    });
    const confidencePayload = (await confidence.json()) as { error?: string };
    if (!confidence.ok) {
      setMessage(confidencePayload.error ?? "Confidence recompute failed.");
      setBusy(false);
      return;
    }
    const cascade = await fetch("/api/manuscripts/cascade/recompute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verseId: pipelineVerseId.trim() }),
    });
    const cascadePayload = (await cascade.json()) as { error?: string };
    if (!cascade.ok) {
      setMessage(cascadePayload.error ?? "Cascade recompute failed.");
      setBusy(false);
      return;
    }
    setMessage(`Confidence + cascade recomputed for ${pipelineVerseId.trim()}.`);
    setBusy(false);
  }

  return (
    <main className="reading-main">
      <section className="panel">
        <h2>Manuscript Import</h2>
        <p className="small">Priority follows book_sources/book_list.csv (P1 → P12).</p>
        {message ? <p className="small">{message}</p> : null}

        <div className="reading-controls-row">
          <button type="button" onClick={syncBookListWitnesses} disabled={busy}>
            Sync Witnesses From book_list.csv
          </button>
        </div>

        <div className="reading-controls-row">
          <label htmlFor="witness-select">Witness</label>
          <select
            id="witness-select"
            value={selectedWitnessId}
            onChange={(event) => setSelectedWitnessId(event.target.value)}
            disabled={busy}
          >
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
        <h3>Witness Details</h3>
        {selectedWitness ? (
          <div className="small">
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
        ) : (
          <p className="small">No witness selected.</p>
        )}
      </section>

      <section className="panel">
        <h3>Page Viewer</h3>
        {selectedPage ? (
          <>
            <p className="small">
              Page {selectedPage.pageIndex} ({selectedPage.status}) | Path: {selectedPage.imagePath}
            </p>
            <div className="reading-controls-row">
              <label htmlFor="zoom-range">Zoom</label>
              <input
                id="zoom-range"
                type="range"
                min={50}
                max={250}
                step={10}
                value={zoomPercent}
                onChange={(event) => setZoomPercent(Number(event.target.value))}
              />
              <span className="small">{zoomPercent}%</span>
            </div>
            <div style={{ border: "1px solid #d1d5db", borderRadius: 8, overflow: "auto", maxHeight: "70vh", padding: "0.5rem" }}>
              {selectedPage.imagePath.match(/\.(png|jpg|jpeg|webp|tif|tiff)$/i) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedPage.imagePath}
                  alt={`Selected page ${selectedPage.pageIndex}`}
                  style={{
                    width: `${zoomPercent}%`,
                    maxWidth: "none",
                    display: "block",
                    transformOrigin: "top left",
                  }}
                />
              ) : (
                <p className="small">Selected file is not browser-renderable image format.</p>
              )}
            </div>
          </>
        ) : (
          <p className="small">Select a page to view at full resolution with zoom/pan.</p>
        )}
      </section>

      <section className="panel">
        <h3>Region Annotation (MVP)</h3>
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
            Save Region
          </button>
        </div>
        {regions.length > 0 ? (
          <div className="small">
            {regions.map((region) => (
              <div key={region.id}>
                #{region.regionIndex} [{region.status}] {region.startVerseId ?? "-"} to {region.endVerseId ?? "-"} bbox(
                {region.bbox.x},{region.bbox.y},{region.bbox.w},{region.bbox.h})
                {" "}
                <button type="button" onClick={() => runOcr(region.id)} disabled={busy}>
                  Run OCR
                </button>
                {" "}
                <button type="button" onClick={() => splitRegion(region.id)} disabled={busy}>
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
        <h3>Pages</h3>
        {pages.length === 0 ? <p className="small">No pages imported yet.</p> : null}
        {pages.map((page) => (
          <article key={page.id} className="panel" style={{ marginBottom: "0.75rem" }}>
            <div className="small">
              <strong>Page {page.pageIndex}</strong> ({page.status})
            </div>
            <div className="small">{page.imagePath}</div>
            {page.imagePath.match(/\.(png|jpg|jpeg|webp|tif|tiff)$/i) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.imagePath} alt={`Page ${page.pageIndex}`} style={{ maxWidth: "100%", marginTop: "0.5rem" }} />
            ) : (
              <div className="small" style={{ marginTop: "0.5rem" }}>
                Non-image source (preview unavailable in browser).
              </div>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
