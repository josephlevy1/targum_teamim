import { NextResponse } from "next/server";
import { authErrorResponse, requireEditorUser } from "@/lib/authz";
import { getRepository } from "@/lib/repository";
import { evaluateSourceGate, markStageCompleted, markStageFailed } from "@/lib/manuscripts-gating";
import { analyzePageForImport } from "@/lib/manuscripts-images";
import { getDataPaths } from "@/lib/config";
import path from "node:path";

export async function POST(request: Request) {
  let username = "local-user";
  try {
    const user = await requireEditorUser();
    username = user.username;
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const witnessId = String(payload.witnessId ?? "").trim();
  const directoryPath = String(payload.directoryPath ?? "").trim();
  const adminOverride = Boolean(payload.adminOverride);
  if (!witnessId || !directoryPath) {
    return NextResponse.json({ error: "witnessId and directoryPath are required." }, { status: 400 });
  }

  try {
    const gate = evaluateSourceGate({ witnessId, stage: "ingest", adminOverride, actor: username });
    if (!gate.allowed) {
      return NextResponse.json({ error: "Priority gate blocked ingest run.", blockers: gate.blockers }, { status: 409 });
    }

    const repo = getRepository();
    const result = repo.importPagesFromDirectory({ witnessId, directoryPath });
    const { dataDir } = getDataPaths();
    const thumbsDir = path.join(dataDir, "imports", "manuscripts", "thumbnails");

    const updatedPages = await Promise.all(
      result.pages.map(async (page) => {
        const analyzed = await analyzePageForImport(page.imagePath, thumbsDir, page.pageIndex);
        return repo.updatePageArtifacts({
          pageId: page.id,
          thumbnailPath: analyzed.thumbnailPath,
          quality: analyzed.quality,
          status: analyzed.status,
        });
      }),
    );

    const summary = updatedPages.reduce(
      (acc, page) => {
        acc[page.status] += 1;
        return acc;
      },
      { ok: 0, partial: 0, unavailable: 0, failed: 0 },
    );

    markStageCompleted(witnessId, "ingest", username, `Imported ${updatedPages.length} pages`);
    return NextResponse.json({
      ok: true,
      imported: result.imported,
      pages: updatedPages,
      summary,
    });
  } catch (error) {
    markStageFailed(witnessId, "ingest", error instanceof Error ? error.message : "Page import failed.", username);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Page import failed.",
      },
      { status: 400 },
    );
  }
}
