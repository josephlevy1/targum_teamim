import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

function detectContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regionId = searchParams.get("regionId")?.trim() ?? "";
  const pageId = searchParams.get("pageId")?.trim() ?? "";
  const variant = (searchParams.get("variant")?.trim() ?? "crop") as "crop" | "thumbnail" | "page";

  const repo = getRepository();
  let filePath = "";

  if (regionId) {
    const region = repo.getPageRegion(regionId);
    if (!region) return NextResponse.json({ error: "Region not found." }, { status: 404 });
    const page = repo.getPage(region.pageId);
    if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
    const artifact = repo.getRegionOcrArtifact(regionId);
    if (variant === "crop") {
      filePath = artifact?.cropPath ?? page.thumbnailPath ?? page.imagePath;
    } else if (variant === "thumbnail") {
      filePath = page.thumbnailPath ?? artifact?.cropPath ?? page.imagePath;
    } else {
      filePath = page.imagePath;
    }
  } else if (pageId) {
    const page = repo.getPage(pageId);
    if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
    filePath = variant === "thumbnail" ? (page.thumbnailPath ?? page.imagePath) : page.imagePath;
  } else {
    return NextResponse.json({ error: "regionId or pageId is required." }, { status: 400 });
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Image file not found." }, { status: 404 });
  }

  const data = fs.readFileSync(filePath);
  return new NextResponse(data, {
    headers: {
      "Content-Type": detectContentType(filePath),
      "Cache-Control": "public, max-age=60",
    },
  });
}
