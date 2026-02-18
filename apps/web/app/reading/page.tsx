"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitizeFileNamePart } from "@/lib/export-ranges";

type ReadingVerse = {
  verseId: string;
  verseNumber: number;
  hebrewText: string;
  aramaicText: string;
  verified: boolean;
  flagged: boolean;
};

type ReadingPayload = {
  selectedBook: string;
  selectedChapter: number;
  books: string[];
  chapters: number[];
  verses: ReadingVerse[];
};

export default function ReadingPage() {
  return (
    <Suspense fallback={<div className="reading-main"><p>Loading…</p></div>}>
      <ReadingPageInner />
    </Suspense>
  );
}

function ReadingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<ReadingPayload | null>(null);
  const [selectedVerseId, setSelectedVerseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportActiveAction, setExportActiveAction] = useState<"verse" | "chapter" | "all" | null>(null);

  const selectedBook = searchParams.get("book") ?? "";
  const selectedChapterRaw = Number(searchParams.get("chapter"));
  const selectedChapter = Number.isInteger(selectedChapterRaw) ? selectedChapterRaw : 0;
  const selectedVerseFromUrl = searchParams.get("verse") ?? "";
  const from = searchParams.get("from") ?? "";
  const returnVerseId = searchParams.get("returnVerseId") ?? "";

  const selectedVerse = useMemo(
    () => payload?.verses.find((verse) => verse.verseId === selectedVerseId) ?? null,
    [payload, selectedVerseId],
  );

  const syncUrl = useCallback(
    (book: string, chapter: number, verseId: string) => {
      const params = new URLSearchParams();
      params.set("book", book);
      params.set("chapter", String(chapter));
      params.set("verse", verseId);
      if (from) params.set("from", from);
      if (returnVerseId) params.set("returnVerseId", returnVerseId);
      router.replace(`/reading?${params.toString()}`);
    },
    [from, returnVerseId, router],
  );

  const loadReading = useCallback(
    async (book: string, chapter: number) => {
      setBusy(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (book) params.set("book", book);
        if (chapter > 0) params.set("chapter", String(chapter));
        const response = await fetch(`/api/reading?${params.toString()}`);
        const json = (await response.json()) as ReadingPayload | { error?: string };
        if (!response.ok || !("verses" in json)) {
          throw new Error(("error" in json && json.error) || "Failed to load reading data.");
        }
        setPayload(json);
        const nextSelected =
          json.verses.find((verse) => verse.verseId === selectedVerseFromUrl)?.verseId ?? json.verses[0]?.verseId ?? "";
        setSelectedVerseId(nextSelected);
        if (json.selectedBook && json.selectedChapter && nextSelected) {
          syncUrl(json.selectedBook, json.selectedChapter, nextSelected);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reading data.");
      } finally {
        setBusy(false);
      }
    },
    [selectedVerseFromUrl, syncUrl],
  );

  useEffect(() => {
    void loadReading(selectedBook, selectedChapter);
  }, [loadReading, selectedBook, selectedChapter]);

  async function setFlaggedForVerse(verseId: string, flagged: boolean) {
    const response = await fetch(`/api/verse/${encodeURIComponent(verseId)}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged }),
    });
    if (!response.ok) {
      const details = (await response.json().catch(() => null)) as { error?: string } | null;
      window.alert(details?.error ?? "Failed to update flag.");
      return;
    }
    setPayload((current) => {
      if (!current) return current;
      return {
        ...current,
        verses: current.verses.map((verse) => (verse.verseId === verseId ? { ...verse, flagged } : verse)),
      };
    });
  }

  async function setVerifiedForVerse(verseId: string, verified: boolean) {
    const response = await fetch(`/api/verse/${encodeURIComponent(verseId)}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified }),
    });
    if (!response.ok) {
      const details = (await response.json().catch(() => null)) as { error?: string } | null;
      window.alert(details?.error ?? "Failed to update verification.");
      return;
    }
    setPayload((current) => {
      if (!current) return current;
      return {
        ...current,
        verses: current.verses.map((verse) => (verse.verseId === verseId ? { ...verse, verified } : verse)),
      };
    });
  }

  const orderedVerses = useMemo(
    () => [...(payload?.verses ?? [])].sort((a, b) => a.verseNumber - b.verseNumber),
    [payload?.verses],
  );

  function buildEditHref(targetVerseId: string, useReturnVerse: boolean): string {
    const params = new URLSearchParams();
    params.set("verseId", useReturnVerse && returnVerseId ? returnVerseId : targetVerseId);
    params.set("from", "reading");
    if (payload?.selectedBook) params.set("book", payload.selectedBook);
    if (payload?.selectedChapter) params.set("chapter", String(payload.selectedChapter));
    params.set("verse", targetVerseId);
    return `/?${params.toString()}`;
  }

  function buildExportUnicodeUrl(start: string, end: string): string {
    const rawRange = `${start}-${end}`;
    return `/api/export/unicode?range=${encodeURIComponent(rawRange)}`;
  }

  function triggerDownload(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  }

  async function downloadText(scope: "verse" | "chapter", filename: string, url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to export ${scope} text.`);
    }
    const text = await response.text();
    triggerDownload(new Blob([text], { type: "text/plain; charset=utf-8" }), filename);
  }

  async function downloadJson(filename: string, url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to export JSON.");
    }
    const exportPayload = (await response.json()) as { data?: unknown };
    const json = `${JSON.stringify(exportPayload.data ?? exportPayload, null, 2)}\n`;
    triggerDownload(new Blob([json], { type: "application/json; charset=utf-8" }), filename);
  }

  async function runExport(action: "verse" | "chapter" | "all") {
    setExportMessage("Exporting...");
    setExportBusy(true);
    setExportActiveAction(action);

    try {
      if (action === "all") {
        await downloadJson("targum_all.json", "/api/export/json");
        setExportMessage("Downloaded targum_all.json");
        return;
      }

      if (action === "verse") {
        const verse = selectedVerse ?? orderedVerses[0];
        if (!verse || !payload?.selectedBook || !payload.selectedChapter) {
          throw new Error("Select a verse to export.");
        }
        const file = `${sanitizeFileNamePart(payload.selectedBook)}_ch${payload.selectedChapter}_v${verse.verseNumber}.txt`;
        await downloadText("verse", file, buildExportUnicodeUrl(verse.verseId, verse.verseId));
        setExportMessage(`Downloaded ${file}`);
        return;
      }

      const first = orderedVerses[0];
      const last = orderedVerses[orderedVerses.length - 1];
      if (!first || !last || !payload?.selectedBook || !payload.selectedChapter) {
        throw new Error("Select a chapter to export.");
      }
      const file = `${sanitizeFileNamePart(payload.selectedBook)}_ch${payload.selectedChapter}.txt`;
      await downloadText("chapter", file, buildExportUnicodeUrl(first.verseId, last.verseId));
      setExportMessage(`Downloaded ${file}`);
    } catch (exportError) {
      setExportMessage(exportError instanceof Error ? exportError.message : "Export failed.");
    } finally {
      setExportBusy(false);
      setExportActiveAction(null);
    }
  }

  return (
    <main className="reading-main">
      <section className="panel reading-controls">
        <div className="reading-controls-header">
          <div className="reading-controls-title-row">
            <h2>Reading Review</h2>
            <button
              type="button"
              className="reading-edit-btn"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((open) => !open)}
            >
              Export
            </button>
          </div>
          <div className="small">Chapter review with verse actions</div>
          {exportOpen ? (
            <div className="reading-export-panel">
              <div className="row reading-export-actions">
                <button
                  className={exportActiveAction === "verse" ? "primary" : ""}
                  onClick={() => void runExport("verse")}
                  disabled={exportBusy || orderedVerses.length === 0}
                >
                  Verse (.txt)
                </button>
                <button
                  className={exportActiveAction === "chapter" ? "primary" : ""}
                  onClick={() => void runExport("chapter")}
                  disabled={exportBusy || orderedVerses.length === 0}
                >
                  Chapter (.txt)
                </button>
                <button
                  className={exportActiveAction === "all" ? "primary" : ""}
                  onClick={() => void runExport("all")}
                  disabled={exportBusy}
                >
                  All (.json)
                </button>
              </div>
              {exportMessage ? <div className="small reading-export-message">{exportMessage}</div> : null}
            </div>
          ) : null}
        </div>
        <div className="reading-controls-row reading-controls-toolbar">
          <div className="reading-field">
            <label className="small" htmlFor="reading-book">Book</label>
            <select
              id="reading-book"
              value={payload?.selectedBook ?? ""}
              onChange={(e) => void loadReading(e.target.value, payload?.chapters[0] ?? 1)}
              disabled={busy}
            >
              {(payload?.books ?? []).map((book) => (
                <option key={book} value={book}>
                  {book}
                </option>
              ))}
            </select>
          </div>
          <div className="reading-field reading-field-chapter">
            <label className="small" htmlFor="reading-chapter">Chapter</label>
            <select
              id="reading-chapter"
              value={payload?.selectedChapter ?? ""}
              onChange={(e) => void loadReading(payload?.selectedBook ?? "", Number(e.target.value))}
              disabled={busy}
            >
              {(payload?.chapters ?? []).map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
          </div>
          <div className="reading-chapter-nav">
          <button
            type="button"
            onClick={() => {
              const currentIndex = (payload?.chapters ?? []).indexOf(payload?.selectedChapter ?? 0);
              const prev = (payload?.chapters ?? [])[currentIndex - 1];
              if (prev) void loadReading(payload?.selectedBook ?? "", prev);
            }}
            disabled={busy || !payload || payload.chapters.indexOf(payload.selectedChapter) <= 0}
          >
            Previous chapter
          </button>
          <button
            type="button"
            onClick={() => {
              const currentIndex = (payload?.chapters ?? []).indexOf(payload?.selectedChapter ?? 0);
              const next = (payload?.chapters ?? [])[currentIndex + 1];
              if (next) void loadReading(payload?.selectedBook ?? "", next);
            }}
            disabled={busy || !payload || payload.chapters.indexOf(payload.selectedChapter) >= payload.chapters.length - 1}
          >
            Next chapter
          </button>
          </div>
        </div>
      </section>

      <section className="panel reading-content">
        {error ? <div className="small">{error}</div> : null}
        {busy ? <div className="small">Loading chapter…</div> : null}
        {(payload?.verses ?? []).map((verse) => (
          <article
            key={verse.verseId}
            className={`reading-verse ${verse.verseId === selectedVerseId ? "active" : ""}`}
            onClick={() => {
              setSelectedVerseId(verse.verseId);
              if (payload) syncUrl(payload.selectedBook, payload.selectedChapter, verse.verseId);
            }}
          >
            <header className="reading-verse-header">
              <span className="reading-verse-number">{verse.verseNumber}</span>
            </header>
            <p className="reading-hebrew" dir="rtl">{verse.hebrewText}</p>
            <p className="reading-aramaic" dir="rtl">{verse.aramaicText}</p>
            <footer className="reading-verse-footer">
              <div className="reading-verse-actions">
                <button
                  type="button"
                  className="small reading-verse-status reading-status-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedVerseId(verse.verseId);
                    if (payload) syncUrl(payload.selectedBook, payload.selectedChapter, verse.verseId);
                    void setVerifiedForVerse(verse.verseId, !verse.verified);
                  }}
                >
                  {verse.verified ? "Verified" : "Pending"}
                </button>
                <button
                  type="button"
                  className={`reading-flag-btn ${verse.flagged ? "is-flagged" : ""}`}
                  aria-label={verse.flagged ? "Unflag verse" : "Flag verse"}
                  title={verse.flagged ? "Unflag verse" : "Flag verse"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedVerseId(verse.verseId);
                    if (payload) syncUrl(payload.selectedBook, payload.selectedChapter, verse.verseId);
                    void setFlaggedForVerse(verse.verseId, !verse.flagged);
                  }}
                >
                  {verse.flagged ? "⚑" : "⚐"}
                </button>
                <a
                  className="reading-edit-btn"
                  href={buildEditHref(verse.verseId, false)}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  Edit
                </a>
              </div>
            </footer>
          </article>
        ))}
      </section>

      <section className="reading-edit-drawer">
        <a
          className="bottom-reading-btn"
          href={buildEditHref(selectedVerse?.verseId ?? selectedVerseFromUrl ?? payload?.verses[0]?.verseId ?? "", false)}
        >
          Edit Mode
        </a>
      </section>
    </main>
  );
}
