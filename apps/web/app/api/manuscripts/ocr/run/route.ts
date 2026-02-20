import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { runRegionOcr } from "@/lib/manuscripts-pipeline";

export async function POST(request: Request) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const regionId = String(payload.regionId ?? "").trim();
  if (!regionId) {
    return NextResponse.json({ error: "regionId is required." }, { status: 400 });
  }

  try {
    const result = runRegionOcr(regionId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OCR failed." }, { status: 400 });
  }
}
