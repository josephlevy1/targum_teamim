import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId")?.trim() ?? "";
  if (!pageId) {
    return NextResponse.json({ error: "pageId is required." }, { status: 400 });
  }

  const repo = getRepository();
  return NextResponse.json({
    regions: repo.listRegionsByPage(pageId),
  });
}

export async function POST(request: Request) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const pageId = String(payload.pageId ?? "").trim();
  const regionIndex = Number(payload.regionIndex ?? NaN);
  const bbox = payload.bbox as { x?: number; y?: number; w?: number; h?: number } | undefined;

  if (!pageId || !Number.isInteger(regionIndex) || !bbox) {
    return NextResponse.json({ error: "pageId, regionIndex, and bbox are required." }, { status: 400 });
  }

  const numericBbox = {
    x: Number(bbox.x ?? NaN),
    y: Number(bbox.y ?? NaN),
    w: Number(bbox.w ?? NaN),
    h: Number(bbox.h ?? NaN),
  };
  if (Object.values(numericBbox).some((value) => Number.isNaN(value))) {
    return NextResponse.json({ error: "Invalid bbox values.", errorCode: "INVALID_BBOX" }, { status: 400 });
  }

  const repo = getRepository();
  const region = repo.upsertPageRegion({
    id: payload.id ? String(payload.id) : undefined,
    pageId,
    regionIndex,
    bbox: numericBbox,
    startVerseId: payload.startVerseId ? String(payload.startVerseId) : null,
    endVerseId: payload.endVerseId ? String(payload.endVerseId) : null,
    status: payload.status as "ok" | "partial" | "unavailable" | "failed" | undefined,
    notes: payload.notes ? String(payload.notes) : "",
  });

  return NextResponse.json({ ok: true, region });
}
