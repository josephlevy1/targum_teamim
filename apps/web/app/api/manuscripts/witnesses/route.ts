import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { syncWitnessesFromBookList } from "@/lib/book-sources";

export async function GET() {
  const repo = getRepository();
  return NextResponse.json({
    witnesses: repo.listWitnesses(),
  });
}

export async function POST(request: Request) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = getRepository();
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (payload.action === "sync_book_list") {
    const synced = syncWitnessesFromBookList();
    return NextResponse.json({
      ok: true,
      synced,
      witnesses: repo.listWitnesses(),
    });
  }

  const id = String(payload.id ?? "").trim();
  const name = String(payload.name ?? "").trim();
  const type = String(payload.type ?? "").trim() as "scanned_images" | "ocr_text" | "digital_text";
  const authorityWeight = Number(payload.authorityWeight ?? NaN);
  if (!id || !name || !["scanned_images", "ocr_text", "digital_text"].includes(type) || Number.isNaN(authorityWeight)) {
    return NextResponse.json({ error: "Invalid witness payload." }, { status: 400 });
  }

  const witness = repo.upsertWitness({
    id,
    name,
    type,
    authorityWeight,
    sourcePriority: Number.isFinite(Number(payload.sourcePriority)) ? Number(payload.sourcePriority) : null,
    sourceLink: payload.sourceLink ? String(payload.sourceLink) : null,
    sourceFileName: payload.sourceFileName ? String(payload.sourceFileName) : null,
    location: payload.location ? String(payload.location) : null,
    year: Number.isFinite(Number(payload.year)) ? Number(payload.year) : null,
    coverage: payload.coverage ? String(payload.coverage) : "",
    notes: payload.notes ? String(payload.notes) : "",
    metadata: typeof payload.metadata === "object" && payload.metadata !== null ? (payload.metadata as Record<string, unknown>) : {},
  });

  return NextResponse.json({ ok: true, witness });
}
