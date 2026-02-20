import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    await requireEditorUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const witnessId = String(payload.witnessId ?? "").trim();
  const directoryPath = String(payload.directoryPath ?? "").trim();
  if (!witnessId || !directoryPath) {
    return NextResponse.json({ error: "witnessId and directoryPath are required." }, { status: 400 });
  }

  try {
    const repo = getRepository();
    const result = repo.importPagesFromDirectory({ witnessId, directoryPath });
    return NextResponse.json({
      ok: true,
      imported: result.imported,
      pages: result.pages,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Page import failed.",
      },
      { status: 400 },
    );
  }
}
