"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { bookRange, chapterRange, sanitizeFileNamePart, verseRange, type ExportRange } from "@/lib/export-ranges";

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
  state: { verified: boolean; flagged: boolean; manuscriptNotes: string; patchCursor: number };
};

type ParsedVerseRef = {
  id: string;
  book: string;
  chapter: number;
  verse: number;
};

type VerseSortMode = "sequential" | "confidence_desc" | "confidence_asc";
type VerseFilterMode = "all" | "verified" | "pending" | "flagged";

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

function tokenLetterText(token: Token, letterIndex: number): string {
  const letter = token.letters[letterIndex];
  if (!letter) return "";
  return `${letter.baseChar}${letter.niqqud.join("")}`;
}

function formatPlacementLabel(position: { tokenIndex: number; letterIndex: number }): string {
  return `Word ${position.tokenIndex + 1}, Letter ${position.letterIndex + 1}`;
}

function tokenPreviewWithLetterHighlight(token: Token, letterIndex: number) {
  return (
    <span className="token-preview-word" dir="rtl">
      {token.letters.map((_, idx) => {
        const text = tokenLetterText(token, idx);
        if (idx === letterIndex) {
          return (
            <strong key={`letter-${idx}`} className="token-preview-letter">
              {text}
            </strong>
          );
        }
        return <span key={`letter-${idx}`}>{text}</span>;
      })}
    </span>
  );
}

function versePath(verseId: string, suffix = ""): string {
  return `/api/verse/${encodeURIComponent(verseId)}${suffix}`;
}

function parseVerseId(id: string): ParsedVerseRef | null {
  const parts = id.split(":");
  if (parts.length < 3) return null;

  const verse = Number(parts[parts.length - 1]);
  const chapter = Number(parts[parts.length - 2]);
  const book = parts.slice(0, -2).join(":").trim();

  if (!book || !Number.isInteger(chapter) || !Number.isInteger(verse)) return null;
  if (chapter <= 0 || verse <= 0) return null;

  return { id, book, chapter, verse };
}

export default function HomePage() {
  const searchParams = useSearchParams();
  const loadVerseRequestSeq = useRef(0);
  const [verseItems, setVerseItems] = useState<Array<{ verseId: string; verified: boolean; flagged: boolean; avgConfidence: number }>>([]);
  const [verseId, setVerseId] = useState<string>("");
  const [didHydrateFromQuery, setDidHydrateFromQuery] = useState(false);
  const [verseSortMode, setVerseSortMode] = useState<VerseSortMode>("sequential");
  const [verseFilterMode, setVerseFilterMode] = useState<VerseFilterMode>("all");
  const [record, setRecord] = useState<VerseRecord | null>(null);
  const [selectedTaamId, setSelectedTaamId] = useState<string | null>(null);
  const [activeToken, setActiveToken] = useState<number | null>(null);
  const [insertPresetName, setInsertPresetName] = useState(TAAM_REPLACEMENTS[0].name);
  const [editPresetName, setEditPresetName] = useState(TAAM_REPLACEMENTS[0].name);
  const [editPickerMode, setEditPickerMode] = useState<"add" | "replace" | null>(null);
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
  const [importOpen, setImportOpen] = useState(false);
  const [transposeBusy, setTransposeBusy] = useState(false);
  const [transposeConfirmMode, setTransposeConfirmMode] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportActiveAction, setExportActiveAction] = useState<"verse" | "chapter" | "book" | "all" | null>(null);

  const selectedTaam = useMemo(() => record?.edited.find((t) => t.taamId === selectedTaamId) ?? null, [record, selectedTaamId]);
  const queryVerseId = searchParams.get("verseId")?.trim() ?? "";
  const fromMode = searchParams.get("from") ?? "";
  const readingBookParam = searchParams.get("book") ?? "";
  const readingChapterParam = Number(searchParams.get("chapter"));
  const readingVerseParam = searchParams.get("verse") ?? "";
  const selectedTaamToken = useMemo(
    () => (selectedTaam ? record?.verse.aramaicTokens[selectedTaam.position.tokenIndex] ?? null : null),
    [record, selectedTaam],
  );
  const lowConfidence = useMemo(
    () =>
      (record?.edited ?? [])
        .filter((t) => t.confidence < 0.65)
        .sort((a, b) => {
          if (a.position.tokenIndex !== b.position.tokenIndex) {
            return a.position.tokenIndex - b.position.tokenIndex;
          }
          if (a.position.letterIndex !== b.position.letterIndex) {
            return a.position.letterIndex - b.position.letterIndex;
          }
          return a.name.localeCompare(b.name);
        }),
    [record],
  );
  const sortedVerseRefs = useMemo(
    () =>
      verseItems
        .map((item) => parseVerseId(item.verseId))
        .filter((item): item is ParsedVerseRef => item !== null)
        .sort((a, b) => {
          const byBook = a.book.localeCompare(b.book);
          if (byBook !== 0) return byBook;
          if (a.chapter !== b.chapter) return a.chapter - b.chapter;
          return a.verse - b.verse;
        }),
    [verseItems],
  );
  const verseItemsWithRef = useMemo(
    () =>
      verseItems
        .map((item) => {
          const ref = parseVerseId(item.verseId);
          return ref ? { ...item, ref } : null;
        })
        .filter(
          (
            item,
          ): item is { verseId: string; verified: boolean; flagged: boolean; avgConfidence: number; ref: ParsedVerseRef } => item !== null,
        ),
    [verseItems],
  );
  const bookOptions = useMemo(
    () => Array.from(new Set(sortedVerseRefs.map((ref) => ref.book))),
    [sortedVerseRefs],
  );
  const selectedVerseRef = useMemo(() => parseVerseId(verseId), [verseId]);
  const readingModeHref = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedVerseRef) {
      params.set("book", selectedVerseRef.book);
      params.set("chapter", String(selectedVerseRef.chapter));
      params.set("verse", selectedVerseRef.id);
      params.set("returnVerseId", selectedVerseRef.id);
    }
    params.set("from", "edit");
    const query = params.toString();
    return query ? `/reading?${query}` : "/reading";
  }, [selectedVerseRef]);
  const backToReadingHref = useMemo(() => {
    if (fromMode !== "reading") return "";
    const params = new URLSearchParams();
    const fallbackRef = selectedVerseRef;
    const nextBook = readingBookParam || fallbackRef?.book || "";
    const nextChapter = Number.isInteger(readingChapterParam) && readingChapterParam > 0
      ? readingChapterParam
      : (fallbackRef?.chapter ?? 0);
    const nextVerse = readingVerseParam || verseId || fallbackRef?.id || "";
    if (nextBook) params.set("book", nextBook);
    if (nextChapter > 0) params.set("chapter", String(nextChapter));
    if (nextVerse) params.set("verse", nextVerse);
    params.set("from", "edit");
    if (verseId) params.set("returnVerseId", verseId);
    return `/reading?${params.toString()}`;
  }, [fromMode, readingBookParam, readingChapterParam, readingVerseParam, selectedVerseRef, verseId]);
  const selectedBook = selectedVerseRef?.book ?? bookOptions[0] ?? "";
  const chapterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          sortedVerseRefs
            .filter((ref) => ref.book === selectedBook)
            .map((ref) => ref.chapter),
        ),
      ).sort((a, b) => a - b),
    [selectedBook, sortedVerseRefs],
  );
  const selectedChapter =
    selectedVerseRef?.book === selectedBook && selectedVerseRef?.chapter
      ? selectedVerseRef.chapter
      : (chapterOptions[0] ?? 0);
  const verseExportRange = useMemo(() => verseRange(selectedVerseRef?.id ?? ""), [selectedVerseRef]);
  const chapterExportRange = useMemo(
    () => chapterRange(sortedVerseRefs, selectedBook, selectedChapter),
    [sortedVerseRefs, selectedBook, selectedChapter],
  );
  const bookExportRange = useMemo(() => bookRange(sortedVerseRefs, selectedBook), [sortedVerseRefs, selectedBook]);
  const verseOptions = useMemo(
    () =>
      sortedVerseRefs
        .filter((ref) => ref.book === selectedBook && ref.chapter === selectedChapter)
        .sort((a, b) => a.verse - b.verse),
    [selectedBook, selectedChapter, sortedVerseRefs],
  );
  const selectedVerseIndex = useMemo(
    () => sortedVerseRefs.findIndex((ref) => ref.id === verseId),
    [sortedVerseRefs, verseId],
  );
  const filteredVerseCount = useMemo(
    () =>
      verseItemsWithRef.filter((item) => {
        if (verseFilterMode === "verified") return item.verified;
        if (verseFilterMode === "pending") return !item.verified;
        if (verseFilterMode === "flagged") return item.flagged;
        return true;
      }).length,
    [verseFilterMode, verseItemsWithRef],
  );
  const visibleVerseItems = useMemo(() => {
    const compareRefs = (a: ParsedVerseRef, b: ParsedVerseRef) => {
      const byBook = a.book.localeCompare(b.book);
      if (byBook !== 0) return byBook;
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    };

    const filtered = verseItemsWithRef.filter((item) => {
      if (verseFilterMode === "verified") return item.verified;
      if (verseFilterMode === "pending") return !item.verified;
      if (verseFilterMode === "flagged") return item.flagged;
      return true;
    });

    if (verseSortMode === "sequential") {
      const inOrder = filtered.slice().sort((a, b) => compareRefs(a.ref, b.ref));
      if (verseFilterMode === "flagged") return inOrder;
      if (!selectedVerseRef) return inOrder.slice(0, 20);
      const currentIndex = inOrder.findIndex((item) => item.verseId === verseId);
      const insertionIndex =
        currentIndex >= 0 ? currentIndex : inOrder.findIndex((item) => compareRefs(item.ref, selectedVerseRef) >= 0);
      const anchorIndex = insertionIndex >= 0 ? insertionIndex : Math.max(0, inOrder.length - 1);
      const start = Math.max(0, anchorIndex - 5);
      return inOrder.slice(start, start + 20);
    }

    const direction = verseSortMode === "confidence_desc" ? -1 : 1;
    const sorted = filtered
      .slice()
      .sort((a, b) => {
        if (a.avgConfidence === b.avgConfidence) {
          return compareRefs(a.ref, b.ref);
        }
        return (a.avgConfidence - b.avgConfidence) * direction;
      });
    if (verseFilterMode === "flagged") return sorted;
    return sorted.slice(0, 20);
  }, [verseFilterMode, verseItemsWithRef, verseSortMode, selectedVerseRef]);

  async function refreshVerses() {
    const res = await fetch("/api/verses");
    const json = await res.json();
    const items = json.items as Array<{ verseId: string; verified: boolean; flagged: boolean; avgConfidence: number }>;
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

  function buildExportUnicodeUrl(range: ExportRange): string {
    const rawRange = `${range.start}-${range.end}`;
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

  async function downloadText(scope: "verse" | "chapter" | "book", filename: string, url: string): Promise<void> {
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
    const payload = (await response.json()) as { data?: unknown };
    const json = `${JSON.stringify(payload.data ?? payload, null, 2)}\n`;
    triggerDownload(new Blob([json], { type: "application/json; charset=utf-8" }), filename);
  }

  async function runExport(action: "verse" | "chapter" | "book" | "all") {
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
        if (!selectedVerseRef || !verseExportRange) {
          throw new Error("Select a verse to export.");
        }
        const file = `${sanitizeFileNamePart(selectedVerseRef.book)}_ch${selectedVerseRef.chapter}_v${selectedVerseRef.verse}.txt`;
        await downloadText("verse", file, buildExportUnicodeUrl(verseExportRange));
        setExportMessage(`Downloaded ${file}`);
        return;
      }

      if (action === "chapter") {
        if (!chapterExportRange || !selectedBook || !selectedChapter) {
          throw new Error("Select a chapter to export.");
        }
        const file = `${sanitizeFileNamePart(selectedBook)}_ch${selectedChapter}.txt`;
        await downloadText("chapter", file, buildExportUnicodeUrl(chapterExportRange));
        setExportMessage(`Downloaded ${file}`);
        return;
      }

      if (!bookExportRange || !selectedBook) {
        throw new Error("Select a book to export.");
      }
      const file = `${sanitizeFileNamePart(selectedBook)}.txt`;
      await downloadText("book", file, buildExportUnicodeUrl(bookExportRange));
      setExportMessage(`Downloaded ${file}`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExportBusy(false);
      setExportActiveAction(null);
    }
  }

  async function loadVerse(id: string, preferredTaamId?: string) {
    const requestSeq = ++loadVerseRequestSeq.current;
    const res = await fetch(versePath(id));
    if (!res.ok) return;
    const json = (await res.json()) as VerseRecord;
    if (requestSeq !== loadVerseRequestSeq.current) {
      return;
    }
    setRecord(json);
    setActiveToken(null);
    setSelectedTaamId((current) => {
      if (preferredTaamId && json.edited.some((taam) => taam.taamId === preferredTaamId)) {
        return preferredTaamId;
      }
      if (current && json.edited.some((taam) => taam.taamId === current)) {
        return current;
      }
      return json.edited[0]?.taamId ?? null;
    });
    setNotes(json.state.manuscriptNotes ?? "");
  }

  async function postPatch(op: unknown, note?: string, preferredTaamId?: string) {
    if (!record) return;
    try {
      const response = await fetch(versePath(record.verse.id, "/patch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, note }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to save patch.");
      }
      await loadVerse(record.verse.id, preferredTaamId);
      await refreshVerses();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save patch.";
      window.alert(message);
    }
  }

  async function moveSelected(tokenDelta: number, letterDelta: number) {
    if (!record || !selectedTaam) return;
    const tokenCount = record.verse.aramaicTokens.length;
    if (tokenCount === 0) return;
    const maxLetterForToken = (tokenIndex: number) =>
      Math.max(0, (record.verse.aramaicTokens[tokenIndex]?.letters.length ?? 1) - 1);

    let toToken = Math.max(0, Math.min(tokenCount - 1, selectedTaam.position.tokenIndex + tokenDelta));
    let toLetter = Math.max(0, Math.min(maxLetterForToken(toToken), selectedTaam.position.letterIndex));

    if (letterDelta !== 0) {
      const step = letterDelta > 0 ? 1 : -1;
      let remaining = Math.abs(letterDelta);

      while (remaining > 0) {
        if (step > 0) {
          const maxLetter = maxLetterForToken(toToken);
          if (toLetter < maxLetter) {
            toLetter += 1;
          } else if (toToken < tokenCount - 1) {
            toToken += 1;
            toLetter = 0;
          }
        } else if (toLetter > 0) {
          toLetter -= 1;
        } else if (toToken > 0) {
          toToken -= 1;
          toLetter = maxLetterForToken(toToken);
        }
        remaining -= 1;
      }
    }

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

  function beginAdd() {
    if (activeToken === null) return;
    if (editPickerMode === "add") {
      setEditPickerMode(null);
      return;
    }
    setEditPresetName(insertPresetName);
    setEditPickerMode("add");
  }

  async function addAtCursor(presetName: string) {
    if (!record) return;
    if (activeToken === null) return;
    const picked = TAAM_REPLACEMENTS.find((item) => item.name === presetName);
    if (!picked) return;
    const tokenIndex = Math.max(0, Math.min(activeToken, record.verse.aramaicTokens.length - 1));
    const targetToken = record.verse.aramaicTokens[tokenIndex];
    if (!targetToken) return;
    const taamId = crypto.randomUUID();
    await postPatch({
      type: "INSERT_TAAM",
      taam: {
        taamId,
        name: picked.name,
        unicodeMark: picked.unicodeMark,
        tier: picked.tier,
        position: { tokenIndex, letterIndex: Math.max(0, targetToken.letters.length - 1) },
        confidence: 0.4,
        reasons: ["manual-insert"],
      },
    }, undefined, taamId);
  }

  function replaceSelected() {
    if (!selectedTaam) return;
    if (editPickerMode === "replace") {
      setEditPickerMode(null);
      return;
    }
    const suggested = TAAM_REPLACEMENTS.find((t) => t.name === selectedTaam.name)?.name ?? TAAM_REPLACEMENTS[0]?.name;
    if (suggested) {
      setEditPresetName(suggested);
    }
    setEditPickerMode("replace");
  }

  async function applyEditPreset() {
    if (editPickerMode === "add") {
      setInsertPresetName(editPresetName);
      await addAtCursor(editPresetName);
      setEditPickerMode(null);
      return;
    }

    if (editPickerMode === "replace") {
      if (!selectedTaam) return;
      const picked = TAAM_REPLACEMENTS.find((t) => t.name === editPresetName);
      if (!picked) return;
      await postPatch({
        type: "SWAP_TAAM",
        taamId: selectedTaam.taamId,
        oldName: selectedTaam.name,
        newName: picked.name,
        newUnicodeMark: picked.unicodeMark,
        newTier: picked.tier,
      });
      setEditPickerMode(null);
    }
  }

  async function runTranspose(clearPatches: boolean) {
    if (!verseId) return;
    setTransposeBusy(true);
    try {
      const response = await fetch(`/api/transpose/${encodeURIComponent(verseId)}`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Transpose failed.");
      }
      if (clearPatches) {
        const resetResponse = await fetch(versePath(verseId, "/reset"), { method: "POST" });
        if (!resetResponse.ok) {
          const resetPayload = (await resetResponse.json()) as { error?: string };
          throw new Error(resetPayload.error ?? "Transpose succeeded, but clearing patches failed.");
        }
      }
      await loadVerse(verseId);
      await refreshVerses();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transpose failed.";
      window.alert(message);
    } finally {
      setTransposeBusy(false);
      setTransposeConfirmMode(false);
    }
  }

  function beginTransposeAgain() {
    if (!verseId || transposeBusy) return;
    if ((record?.state.patchCursor ?? 0) > 0) {
      setTransposeConfirmMode(true);
      return;
    }
    void runTranspose(false);
  }

  function cancelTransposeConfirm() {
    setTransposeConfirmMode(false);
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

  async function saveFlagged(flagged: boolean) {
    if (!record) return;
    await fetch(versePath(record.verse.id, "/flag"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged }),
    });
    await loadVerse(record.verse.id);
    await refreshVerses();
  }

  function jumpToAdjacentVerse(offset: number) {
    if (selectedVerseIndex < 0) return;
    const target = sortedVerseRefs[selectedVerseIndex + offset];
    if (target) setVerseId(target.id);
  }

  useEffect(() => {
    void refreshVerses();
  }, []);

  useEffect(() => {
    if (didHydrateFromQuery) return;
    if (!queryVerseId) {
      setDidHydrateFromQuery(true);
      return;
    }
    if (verseItems.length === 0) return;
    if (verseItems.some((item) => item.verseId === queryVerseId)) {
      setVerseId(queryVerseId);
    }
    setDidHydrateFromQuery(true);
  }, [didHydrateFromQuery, queryVerseId, verseItems]);

  useEffect(() => {
    if (verseId) {
      void loadVerse(verseId);
    }
  }, [verseId]);

  useEffect(() => {
    setTransposeConfirmMode(false);
  }, [verseId]);

  useEffect(() => {
    setEditPickerMode(null);
  }, [selectedTaamId, verseId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!record) return;
      if (e.key === "[") {
        e.preventDefault();
        void moveSelected(1, 0);
      }
      if (e.key === "]") {
        e.preventDefault();
        void moveSelected(-1, 0);
      }
      if (e.key === ",") {
        e.preventDefault();
        void moveSelected(0, 1);
      }
      if (e.key === ".") {
        e.preventDefault();
        void moveSelected(0, -1);
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        replaceSelected();
      }
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        void deleteSelected();
      }
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        beginAdd();
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
      <section className="panel left-panel">
        <div className="left-scroll nav-scroll">
          <h3>Verse Navigator</h3>
          <div className="row left-nav-actions">
            <button onClick={() => jumpToAdjacentVerse(-1)} disabled={selectedVerseIndex <= 0}>
              Previous verse
            </button>
            <button
              onClick={() => jumpToAdjacentVerse(1)}
              disabled={selectedVerseIndex < 0 || selectedVerseIndex >= sortedVerseRefs.length - 1}
            >
              Next verse
            </button>
          </div>
          <label className="small" style={{ marginTop: 8 }}>Book</label>
          <select
            value={selectedBook}
            onChange={(e) => {
              const nextBook = e.target.value;
              const firstInBook = sortedVerseRefs.find((ref) => ref.book === nextBook);
              if (firstInBook) setVerseId(firstInBook.id);
            }}
          >
            {bookOptions.map((book) => (
              <option key={book} value={book}>
                {book}
              </option>
            ))}
          </select>
          <label className="small" style={{ marginTop: 8 }}>Chapter</label>
          <select
            value={selectedChapter || ""}
            onChange={(e) => {
              const nextChapter = Number(e.target.value);
              const firstInChapter = sortedVerseRefs.find((ref) => ref.book === selectedBook && ref.chapter === nextChapter);
              if (firstInChapter) setVerseId(firstInChapter.id);
            }}
          >
            {chapterOptions.map((chapter) => (
              <option key={chapter} value={chapter}>
                {chapter}
              </option>
            ))}
          </select>
          <label className="small" style={{ marginTop: 8 }}>Verse</label>
          <select value={verseId} onChange={(e) => setVerseId(e.target.value)}>
            {verseOptions.map((ref) => (
              <option key={ref.id} value={ref.id}>
                {ref.verse}
              </option>
            ))}
          </select>
          <div className="small nav-meta" style={{ marginTop: 6 }}>
            {sortedVerseRefs.length} structured verse IDs loaded
          </div>
          <label className="small" style={{ marginTop: 8 }}>Sort by</label>
          <select value={verseSortMode} onChange={(e) => setVerseSortMode(e.target.value as VerseSortMode)}>
            <option value="sequential">Sequential</option>
            <option value="confidence_desc">Confidence Level (descending)</option>
            <option value="confidence_asc">Confidence Level (ascending)</option>
          </select>
          <div className="small nav-meta" style={{ marginTop: 8 }}>Filter</div>
          <div className="row nav-filter-row">
            <button
              className={`subtle nav-filter-btn ${verseFilterMode === "all" ? "active" : ""}`}
              onClick={() => setVerseFilterMode("all")}
            >
              All
            </button>
            <button
              className={`subtle nav-filter-btn ${verseFilterMode === "verified" ? "active" : ""}`}
              onClick={() => setVerseFilterMode("verified")}
            >
              Verified
            </button>
            <button
              className={`subtle nav-filter-btn ${verseFilterMode === "pending" ? "active" : ""}`}
              onClick={() => setVerseFilterMode("pending")}
            >
              Pending
            </button>
            <button
              className={`subtle nav-filter-btn ${verseFilterMode === "flagged" ? "active" : ""}`}
              onClick={() => setVerseFilterMode("flagged")}
            >
              Flagged
            </button>
          </div>
          <div className="small nav-meta" style={{ marginTop: 6 }}>
            {verseFilterMode === "flagged"
              ? `Showing ${visibleVerseItems.length} of ${filteredVerseCount}`
              : `Showing top ${visibleVerseItems.length} of ${filteredVerseCount}`}
          </div>
          {visibleVerseItems.map((item) => (
              <div
                key={item.verseId}
                className={`verse-item ${item.verseId === verseId ? "active" : ""}`}
                onClick={() => setVerseId(item.verseId)}
              >
                <div>{item.verseId}</div>
                <div className="small">
                  conf {(item.avgConfidence * 100).toFixed(0)}% {item.verified ? "| verified" : "| pending"}
                  {item.flagged ? <span className="nav-flag-indicator"> | ⚑</span> : null}
                </div>
              </div>
            ))}
        </div>
      </section>

      <section className="panel center-panel">
        <div className="center-toolbar">
          <div className="center-verse-heading">
            <h2>{record?.verse.id ?? "No verse loaded"}</h2>
            <button
              type="button"
              className={`editor-flag-btn ${record?.state.flagged ? "is-flagged" : ""}`}
              aria-label={record?.state.flagged ? "Unflag verse" : "Flag verse"}
              title={record?.state.flagged ? "Unflag verse" : "Flag verse"}
              onClick={() => void saveFlagged(!(record?.state.flagged ?? false))}
              disabled={!record}
            >
              {record?.state.flagged ? "⚑" : "⚐"}
            </button>
          </div>
          <div className="row">
            {transposeConfirmMode ? (
              <button onClick={cancelTransposeConfirm} disabled={transposeBusy}>Cancel</button>
            ) : null}
            <button
              className={transposeConfirmMode ? "danger" : ""}
              onClick={() => (transposeConfirmMode ? void runTranspose(true) : beginTransposeAgain())}
              disabled={transposeBusy || !verseId}
            >
              {transposeBusy ? "Working..." : transposeConfirmMode ? "Reset Verse" : "Transpose Again"}
            </button>
            <button className="shortcut-btn" onClick={undo}>Undo <span className="kbd-hint">U</span></button>
            <button className="shortcut-btn" onClick={redo}>Redo <span className="kbd-hint">Shift+U</span></button>
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
                onClick={() => setActiveToken((current) => (current === tokenIndex ? null : tokenIndex))}
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
        <div className="row center-verse-nav">
          <button onClick={() => jumpToAdjacentVerse(-1)} disabled={selectedVerseIndex <= 0}>
            Previous verse
          </button>
          <button
            onClick={() => jumpToAdjacentVerse(1)}
            disabled={selectedVerseIndex < 0 || selectedVerseIndex >= sortedVerseRefs.length - 1}
          >
            Next verse
          </button>
        </div>
      </section>

      <section className="panel right-panel">
        <div className="right-panel-content">
          <section className="right-section">
            <div className="right-section-label">Selection</div>
            {selectedTaam ? (
              <div className="selected-taam-card">
                <div className="selected-taam-title">{selectedTaam.name}</div>
                <div className="small">
                  {formatPlacementLabel(selectedTaam.position)}, confidence {(selectedTaam.confidence * 100).toFixed(0)}%
                </div>
                {selectedTaamToken ? (
                  <div className="small token-preview-line">
                    {tokenPreviewWithLetterHighlight(selectedTaamToken, selectedTaam.position.letterIndex)}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="small">Select a ta’am badge</div>
            )}
          </section>

          <section className="right-section">
            <div className="right-section-label">Navigate</div>
            <div className="nav-grid">
              <button className="subtle nav-btn shortcut-btn" onClick={() => void moveSelected(-1, 0)}><span className="nav-label">▶ Prev word</span><span className="kbd-hint">]</span></button>
              <button className="subtle nav-btn shortcut-btn" onClick={() => void moveSelected(1, 0)}><span className="nav-label">Next word</span><span className="kbd-hint">[</span><span className="nav-edge-arrow">◀</span></button>
              <button className="subtle nav-btn shortcut-btn" onClick={() => void moveSelected(0, -1)}><span className="nav-label">▶ Prev letter</span><span className="kbd-hint">.</span></button>
              <button className="subtle nav-btn shortcut-btn" onClick={() => void moveSelected(0, 1)}><span className="nav-label">Next letter</span><span className="kbd-hint">,</span><span className="nav-edge-arrow">◀</span></button>
            </div>
          </section>

          <section className="right-section">
            <div className="right-section-label">Edit</div>
            <div className="row action-row">
              <button
                className={`${editPickerMode === "replace" ? "primary" : "subtle"} shortcut-btn ${selectedTaam ? "" : "soft-disabled"}`}
                onClick={replaceSelected}
                aria-disabled={!selectedTaam}
                data-disabled-reason={!selectedTaam ? "Select a ta’am to enable Replace" : undefined}
              >
                Replace <span className="kbd-hint">R</span>
              </button>
              <button
                className={`${editPickerMode === "add" ? "primary" : "subtle"} shortcut-btn add-tooltip-top ${activeToken === null ? "soft-disabled" : ""}`}
                onClick={beginAdd}
                aria-disabled={activeToken === null}
                data-disabled-reason={activeToken === null ? "Select a word to enable Add" : undefined}
              >
                Add <span className="kbd-hint">A</span>
              </button>
              <button className="destructive shortcut-btn" onClick={deleteSelected}>Delete <span className="kbd-hint">D</span></button>
            </div>
            {editPickerMode ? (
              <div className="row taam-preset-row">
                <select
                  id="edit-taam-preset"
                  value={editPresetName}
                  onChange={(e) => setEditPresetName(e.target.value)}
                >
                  {TAAM_REPLACEMENTS.map((taam) => (
                    <option key={`edit-preset-${taam.name}`} value={taam.name}>
                      {taam.unicodeMark} {taam.name}
                    </option>
                  ))}
                </select>
                <button className="primary" onClick={applyEditPreset}>
                  {editPickerMode === "replace" ? "Apply Replace" : "Apply Add"}
                </button>
              </div>
            ) : null}
          </section>

          <section className="right-section">
            <div className="right-section-label">Review</div>
            <h3 className="section-title">Low-Confidence Queue</h3>
            <div className="small">{lowConfidence.length} placements</div>
            {lowConfidence.map((t) => (
              <div
                key={`low-${t.taamId}`}
                className={`verse-item queue-item ${selectedTaamId === t.taamId ? "active" : ""}`}
                onClick={() => setSelectedTaamId(t.taamId)}
              >
                <div>{t.unicodeMark} {t.name} ({(t.confidence * 100).toFixed(0)}%)</div>
                <div className="small queue-meta">
                  {formatPlacementLabel(t.position)}
                  {record?.verse.aramaicTokens[t.position.tokenIndex]
                    ? ` • ${record.verse.aramaicTokens[t.position.tokenIndex].surface}`
                    : ""}
                </div>
                {record?.verse.aramaicTokens[t.position.tokenIndex] ? (
                  <div className="small token-preview-line">
                    {tokenPreviewWithLetterHighlight(record.verse.aramaicTokens[t.position.tokenIndex], t.position.letterIndex)}
                  </div>
                ) : null}
              </div>
            ))}

            <h3 className="section-title">Notes</h3>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={() => saveVerification(false)}>Save Note</button>
            </div>

            <details className="patch-history">
              <summary className="section-title">Patch History</summary>
              {(record?.patches ?? []).map((p) => (
                <div key={p.id} className="small">
                  #{p.seqNo} {p.op.type} {p.note ?? ""}
                </div>
              ))}
            </details>
          </section>
        </div>

        <div className="right-panel-footer">
          <button
            className={record?.state.verified ? "primary" : ""}
            onClick={() => saveVerification(!(record?.state.verified ?? false))}
          >
            Mark Verified
          </button>
        </div>
      </section>

      <section className={`import-drawer ${importOpen ? "open" : ""}`}>
        <button className="import-toggle" aria-expanded={importOpen} onClick={() => setImportOpen((open) => !open)}>
          <span>Import</span>
          <span aria-hidden="true">{importOpen ? "▾" : "▸"}</span>
        </button>
        <div className="import-content">
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
        </div>
      </section>

      <section className="reading-drawer">
        <a className="bottom-reading-btn" href={backToReadingHref || readingModeHref}>
          Reading Mode
        </a>
      </section>

      <section className={`export-drawer ${exportOpen ? "open" : ""}`}>
        <button className="export-toggle" aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)}>
          <span>Export</span>
          <span aria-hidden="true">{exportOpen ? "▾" : "▸"}</span>
        </button>
        <div className="export-content">
          <h3>Export</h3>
          <div className="small">Rendered Targum text for scoped exports</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className={exportActiveAction === "verse" ? "primary" : ""}
              onClick={() => void runExport("verse")}
              disabled={exportBusy || !verseExportRange}
            >
              Verse (.txt)
            </button>
            <button
              className={exportActiveAction === "chapter" ? "primary" : ""}
              onClick={() => void runExport("chapter")}
              disabled={exportBusy || !chapterExportRange}
            >
              Chapter (.txt)
            </button>
            <button
              className={exportActiveAction === "book" ? "primary" : ""}
              onClick={() => void runExport("book")}
              disabled={exportBusy || !bookExportRange}
            >
              Book (.txt)
            </button>
            <button
              className={exportActiveAction === "all" ? "primary" : ""}
              onClick={() => void runExport("all")}
              disabled={exportBusy || sortedVerseRefs.length === 0}
            >
              All (.json)
            </button>
          </div>
          {exportMessage ? <div className="small" style={{ marginTop: 6 }}>{exportMessage}</div> : null}
        </div>
      </section>
    </main>
  );
}
