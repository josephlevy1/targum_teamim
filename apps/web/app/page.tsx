"use client";

import { useEffect, useMemo, useState } from "react";

type Tier = "DISJUNCTIVE" | "CONJUNCTIVE" | "METEG_LIKE" | "PISUQ";

type GeneratedTaam = {
  taamId: string;
  name: string;
  unicodeMark: string;
  tier: Tier;
  position: { tokenIndex: number; letterIndex: number };
  confidence: number;
  reasons: string[];
};

type Token = {
  surface: string;
  letters: Array<{ baseChar: string; niqqud: string[] }>;
};

type VerseRecord = {
  verse: { id: string; hebrewTokens: Token[]; aramaicTokens: Token[] };
  generated: GeneratedTaam[];
  edited: GeneratedTaam[];
  patches: Array<{ id: string; seqNo: number; op: { type: string }; note?: string; createdAt: string }>;
  state: { verified: boolean; manuscriptNotes: string; patchCursor: number };
};

const TAAM_REPLACEMENTS: Array<{ name: string; unicodeMark: string; tier: Tier }> = [
  { name: "MUNAH", unicodeMark: "֣", tier: "CONJUNCTIVE" },
  { name: "MERKHA", unicodeMark: "֥", tier: "CONJUNCTIVE" },
  { name: "TIPEHA", unicodeMark: "֖", tier: "CONJUNCTIVE" },
  { name: "ETNACHTA", unicodeMark: "֑", tier: "DISJUNCTIVE" },
  { name: "ZAQEF_QATAN", unicodeMark: "֔", tier: "DISJUNCTIVE" },
  { name: "SOF_PASUK", unicodeMark: "׃", tier: "PISUQ" },
];

function tokenTextWithTaamim(token: Token, tokenTaamim: GeneratedTaam[]): string {
  const marksByLetter = new Map<number, string[]>();
  for (const taam of tokenTaamim) {
    const letterMarks = marksByLetter.get(taam.position.letterIndex) ?? [];
    letterMarks.push(taam.unicodeMark);
    marksByLetter.set(taam.position.letterIndex, letterMarks);
  }

  return token.letters
    .map((letter, letterIndex) => {
      const taamMarks = marksByLetter.get(letterIndex) ?? [];
      return `${letter.baseChar}${letter.niqqud.join("")}${taamMarks.join("")}`;
    })
    .join("");
}

function versePath(verseId: string, suffix = ""): string {
  return `/api/verse/${encodeURIComponent(verseId)}${suffix}`;
}

export default function HomePage() {
  const [verseItems, setVerseItems] = useState<Array<{ verseId: string; verified: boolean; avgConfidence: number }>>([]);
  const [verseId, setVerseId] = useState<string>("");
  const [record, setRecord] = useState<VerseRecord | null>(null);
  const [selectedTaamId, setSelectedTaamId] = useState<string | null>(null);
  const [activeToken, setActiveToken] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [importMode, setImportMode] = useState<"single" | "chapter">("single");
  const [importTarget, setImportTarget] = useState<"hebrew" | "targum" | "both">("both");
  const [singleVerseId, setSingleVerseId] = useState("");
  const [singleHebrew, setSingleHebrew] = useState("");
  const [singleTargum, setSingleTargum] = useState("");
  const [chapterHebrewFile, setChapterHebrewFile] = useState<File | null>(null);
  const [chapterTargumFile, setChapterTargumFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  const selectedTaam = useMemo(() => record?.edited.find((t) => t.taamId === selectedTaamId) ?? null, [record, selectedTaamId]);
  const lowConfidence = useMemo(
    () => (record?.edited ?? []).filter((t) => t.confidence < 0.65).sort((a, b) => a.confidence - b.confidence),
    [record],
  );

  async function refreshVerses() {
    const res = await fetch("/api/verses");
    const json = await res.json();
    const items = json.items as Array<{ verseId: string; verified: boolean; avgConfidence: number }>;
    setVerseItems(items);
    if (!verseId && items.length > 0) {
      setVerseId(items[0].verseId);
    }
  }

  async function postImport(url: string, content: string): Promise<number> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const json = (await res.json()) as { imported?: number; error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? `Import failed: ${url}`);
    }
    return json.imported ?? 0;
  }

  function firstVerseIdFromTsv(content: string): string | null {
    const line = content
      .split(/\r?\n/)
      .map((row) => row.trim())
      .find(Boolean);
    if (!line) return null;
    const [id] = line.split("\t");
    return id?.trim() || null;
  }

  async function runImport() {
    setImportMessage("");
    setImportBusy(true);
    try {
      let firstVerse: string | null = null;
      let imported = 0;

      if (importMode === "single") {
        const normalizedId = singleVerseId.trim();
        if (!normalizedId) {
          throw new Error("Verse ID is required (example: Genesis:1:1)");
        }
        if (!/^[^:\s]+:\d+:\d+$/.test(normalizedId)) {
          throw new Error("Verse ID must match Book:Chapter:Verse (example: Genesis:1:1).");
        }

        const hebrewLine = `${normalizedId}\t${singleHebrew.trim()}`;
        const targumLine = `${normalizedId}\t${singleTargum.trim()}`;

        if (importTarget !== "targum" && singleHebrew.trim()) {
          imported += await postImport("/api/import/hebrew", hebrewLine);
          firstVerse = normalizedId;
        }
        if (importTarget !== "hebrew" && singleTargum.trim()) {
          imported += await postImport("/api/import/targum", targumLine);
          firstVerse = normalizedId;
        }
        if (imported === 0) {
          throw new Error("Add text for the selected import target.");
        }
      } else {
        if (importTarget !== "targum") {
          if (!chapterHebrewFile) {
            throw new Error("Select a Hebrew TSV file.");
          }
          const content = await chapterHebrewFile.text();
          imported += await postImport("/api/import/hebrew", content);
          firstVerse = firstVerseIdFromTsv(content);
        }
        if (importTarget !== "hebrew") {
          if (!chapterTargumFile) {
            throw new Error("Select a Targum TSV file.");
          }
          const content = await chapterTargumFile.text();
          imported += await postImport("/api/import/targum", content);
          firstVerse = firstVerse ?? firstVerseIdFromTsv(content);
        }
      }

      await refreshVerses();
      if (firstVerse) {
        setVerseId(firstVerse);
      }
      setImportMessage(`Imported ${imported} record(s).`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  async function loadVerse(id: string) {
    const res = await fetch(versePath(id));
    if (!res.ok) return;
    const json = (await res.json()) as VerseRecord;
    setRecord(json);
    setSelectedTaamId(json.edited[0]?.taamId ?? null);
    setNotes(json.state.manuscriptNotes ?? "");
  }

  async function postPatch(op: unknown, note?: string) {
    if (!record) return;
    await fetch(versePath(record.verse.id, "/patch"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, note }),
    });
    await loadVerse(record.verse.id);
    await refreshVerses();
  }

  async function moveSelected(tokenDelta: number, letterDelta: number) {
    if (!record || !selectedTaam) return;
    const tokenCount = record.verse.aramaicTokens.length;
    const toToken = Math.max(0, Math.min(tokenCount - 1, selectedTaam.position.tokenIndex + tokenDelta));
    const targetToken = record.verse.aramaicTokens[toToken];
    const maxLetter = Math.max(0, targetToken.letters.length - 1);
    const toLetter = Math.max(0, Math.min(maxLetter, selectedTaam.position.letterIndex + letterDelta));

    await postPatch({
      type: "MOVE_TAAM",
      taamId: selectedTaam.taamId,
      from: selectedTaam.position,
      to: { tokenIndex: toToken, letterIndex: toLetter },
    });
  }

  async function deleteSelected() {
    if (!selectedTaam) return;
    await postPatch({ type: "DELETE_TAAM", taamId: selectedTaam.taamId });
  }

  async function addAtCursor() {
    if (!record) return;
    const picked = TAAM_REPLACEMENTS[0];
    await postPatch({
      type: "INSERT_TAAM",
      taam: {
        taamId: crypto.randomUUID(),
        name: picked.name,
        unicodeMark: picked.unicodeMark,
        tier: picked.tier,
        position: { tokenIndex: activeToken, letterIndex: Math.max(0, record.verse.aramaicTokens[activeToken].letters.length - 1) },
        confidence: 0.4,
        reasons: ["manual-insert"],
      },
    });
  }

  async function replaceSelected() {
    if (!selectedTaam) return;
    const pickedName = window.prompt(`Replace with: ${TAAM_REPLACEMENTS.map((t) => t.name).join(", ")}`, selectedTaam.name);
    if (!pickedName) return;
    const picked = TAAM_REPLACEMENTS.find((t) => t.name === pickedName.trim().toUpperCase());
    if (!picked) return;
    await postPatch({
      type: "SWAP_TAAM",
      taamId: selectedTaam.taamId,
      oldName: selectedTaam.name,
      newName: picked.name,
      newUnicodeMark: picked.unicodeMark,
      newTier: picked.tier,
    });
  }

  async function runTranspose() {
    if (!verseId) return;
    await fetch(`/api/transpose/${encodeURIComponent(verseId)}`, { method: "POST" });
    await loadVerse(verseId);
    await refreshVerses();
  }

  async function undo() {
    if (!record) return;
    await fetch(versePath(record.verse.id, "/undo"), { method: "POST" });
    await loadVerse(record.verse.id);
    await refreshVerses();
  }

  async function redo() {
    if (!record) return;
    await fetch(versePath(record.verse.id, "/redo"), { method: "POST" });
    await loadVerse(record.verse.id);
    await refreshVerses();
  }

  async function saveVerification(verified: boolean) {
    if (!record) return;
    await fetch(versePath(record.verse.id, "/verify"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified, manuscriptNotes: notes }),
    });
    await loadVerse(record.verse.id);
    await refreshVerses();
  }

  useEffect(() => {
    void refreshVerses();
  }, []);

  useEffect(() => {
    if (verseId) {
      void loadVerse(verseId);
    }
  }, [verseId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!record) return;
      if (e.key === "[") {
        e.preventDefault();
        void moveSelected(-1, 0);
      }
      if (e.key === "]") {
        e.preventDefault();
        void moveSelected(1, 0);
      }
      if (e.key === ",") {
        e.preventDefault();
        void moveSelected(0, -1);
      }
      if (e.key === ".") {
        e.preventDefault();
        void moveSelected(0, 1);
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        void replaceSelected();
      }
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        void deleteSelected();
      }
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        void addAtCursor();
      }
      if (e.key.toLowerCase() === "u" && e.shiftKey) {
        e.preventDefault();
        void redo();
      }
      if (e.key.toLowerCase() === "u" && !e.shiftKey) {
        e.preventDefault();
        void undo();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [record, selectedTaam, activeToken, notes]);

  return (
    <main>
      <section className="panel">
        <h3>Import</h3>
        <div className="row">
          <button className={importMode === "single" ? "primary" : ""} onClick={() => setImportMode("single")}>Single passuk</button>
          <button className={importMode === "chapter" ? "primary" : ""} onClick={() => setImportMode("chapter")}>Chapter TSV</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <label className="small">Target</label>
          <select value={importTarget} onChange={(e) => setImportTarget(e.target.value as "hebrew" | "targum" | "both")}>
            <option value="both">Hebrew + Targum</option>
            <option value="hebrew">Hebrew only</option>
            <option value="targum">Targum only</option>
          </select>
        </div>

        {importMode === "single" ? (
          <>
            <label className="small" style={{ marginTop: 8 }}>Verse ID</label>
            <input value={singleVerseId} onChange={(e) => setSingleVerseId(e.target.value)} placeholder="Genesis:1:1" />
            {importTarget !== "targum" ? (
              <>
                <label className="small" style={{ marginTop: 8 }}>Hebrew text</label>
                <textarea value={singleHebrew} onChange={(e) => setSingleHebrew(e.target.value)} />
              </>
            ) : null}
            {importTarget !== "hebrew" ? (
              <>
                <label className="small" style={{ marginTop: 8 }}>Targum text</label>
                <textarea value={singleTargum} onChange={(e) => setSingleTargum(e.target.value)} />
              </>
            ) : null}
          </>
        ) : (
          <>
            {importTarget !== "targum" ? (
              <>
                <label className="small" style={{ marginTop: 8 }}>Hebrew TSV</label>
                <input type="file" accept=".tsv,text/tab-separated-values,text/plain" onChange={(e) => setChapterHebrewFile(e.target.files?.[0] ?? null)} />
              </>
            ) : null}
            {importTarget !== "hebrew" ? (
              <>
                <label className="small" style={{ marginTop: 8 }}>Targum TSV</label>
                <input type="file" accept=".tsv,text/tab-separated-values,text/plain" onChange={(e) => setChapterTargumFile(e.target.files?.[0] ?? null)} />
              </>
            ) : null}
          </>
        )}

        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={runImport} disabled={importBusy}>
            {importBusy ? "Importing..." : "Import"}
          </button>
        </div>
        {importMessage ? <div className="small" style={{ marginTop: 6 }}>{importMessage}</div> : null}

        <hr />
        <h3>Verse Navigator</h3>
        <div className="small">Low-confidence first</div>
        {verseItems
          .slice()
          .sort((a, b) => a.avgConfidence - b.avgConfidence)
          .map((item) => (
            <div
              key={item.verseId}
              className={`verse-item ${item.verseId === verseId ? "active" : ""}`}
              onClick={() => setVerseId(item.verseId)}
            >
              <div>{item.verseId}</div>
              <div className="small">
                conf {(item.avgConfidence * 100).toFixed(0)}% {item.verified ? "| verified" : "| pending"}
              </div>
            </div>
          ))}
      </section>

      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>{record?.verse.id ?? "No verse loaded"}</h2>
          <div className="row">
            <button className="primary" onClick={runTranspose}>Transpose</button>
            <button onClick={undo}>Undo (U)</button>
            <button onClick={redo}>Redo (Shift+U)</button>
          </div>
        </div>

        <h4>Hebrew (read-only)</h4>
        <div className="hebrew">{record?.verse.hebrewTokens.map((t) => t.surface).join(" ")}</div>

        <h4>Aramaic (editable ta’amim layer)</h4>
        <div className="row aramaic">
          {record?.verse.aramaicTokens.map((token, tokenIndex) => {
            const tokenTaamim = record.edited.filter((t) => t.position.tokenIndex === tokenIndex);
            return (
              <div
                key={`${token.surface}-${tokenIndex}`}
                className={`token ${activeToken === tokenIndex ? "active" : ""}`}
                onClick={() => setActiveToken(tokenIndex)}
              >
                <div>{tokenTextWithTaamim(token, tokenTaamim)}</div>
                <div>
                  {tokenTaamim.map((t) => (
                    <span
                      key={t.taamId}
                      className={`badge ${selectedTaamId === t.taamId ? "selected" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTaamId(t.taamId);
                      }}
                    >
                      {t.unicodeMark} {t.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h3>Selected Ta’am</h3>
        {selectedTaam ? (
          <>
            <div>{selectedTaam.name}</div>
            <div className="small">
              token {selectedTaam.position.tokenIndex}, letter {selectedTaam.position.letterIndex}, confidence {(selectedTaam.confidence * 100).toFixed(0)}%
            </div>
          </>
        ) : (
          <div className="small">Select a ta’am badge</div>
        )}

        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => void moveSelected(-1, 0)}>[ prev word</button>
          <button onClick={() => void moveSelected(1, 0)}>] next word</button>
          <button onClick={() => void moveSelected(0, -1)}>, prev letter</button>
          <button onClick={() => void moveSelected(0, 1)}>. next letter</button>
          <button onClick={replaceSelected}>R replace</button>
          <button onClick={deleteSelected}>D delete</button>
          <button onClick={addAtCursor}>A add</button>
        </div>

        <h3>Low-Confidence Queue</h3>
        <div className="small">{lowConfidence.length} placements</div>
        {lowConfidence.map((t) => (
          <div key={`low-${t.taamId}`} className="verse-item" onClick={() => setSelectedTaamId(t.taamId)}>
            {t.unicodeMark} {t.name} @ {t.position.tokenIndex}:{t.position.letterIndex} ({(t.confidence * 100).toFixed(0)}%)
          </div>
        ))}

        <h3>Manuscript Notes</h3>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => saveVerification(false)}>Save Note</button>
          <button className="primary" onClick={() => saveVerification(true)}>Mark Verified</button>
        </div>

        <h3>Patch History</h3>
        {(record?.patches ?? []).map((p) => (
          <div key={p.id} className="small">
            #{p.seqNo} {p.op.type} {p.note ?? ""}
          </div>
        ))}
      </section>
    </main>
  );
}
