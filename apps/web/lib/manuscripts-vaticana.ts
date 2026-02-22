import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export interface VaticanaFetchOptions {
  witnessId: string;
  sourceLink: string;
  startPage: number;
  pageCount: number;
  outDir: string;
  retries?: number;
  backoffMs?: number;
  minWidth?: number;
  minHeight?: number;
  manifestUrl?: string;
}

export interface VaticanaFetchResult {
  witnessId: string;
  manifestUrl: string;
  sourceLink: string;
  fetchedPages: Array<{
    pageIndex: number;
    imageUrl: string;
    localPath: string;
    width: number;
    height: number;
  }>;
  savedAt: string;
  rawPagesDir: string;
  fetchManifestPath: string;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries: number, backoffMs: number): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return res;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(backoffMs * (attempt + 1));
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : `Failed to fetch ${url}`);
}

async function fetchImageResponseWithFallback(url: string, retries: number, backoffMs: number): Promise<{ response: Response; resolvedUrl: string }> {
  const initial = await fetchWithRetry(url, retries, backoffMs);
  const contentType = initial.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return { response: initial, resolvedUrl: url };
  }

  const serviceJson = (await initial.json()) as Record<string, unknown>;
  const serviceObj = (serviceJson.service ?? {}) as Record<string, unknown>;
  const serviceObjArray = Array.isArray(serviceJson.service) ? (serviceJson.service[0] as Record<string, unknown>) : undefined;
  const serviceId =
    (typeof serviceObj["@id"] === "string" ? String(serviceObj["@id"]) : null) ||
    (typeof serviceObj.id === "string" ? String(serviceObj.id) : null) ||
    (serviceObjArray && typeof serviceObjArray["@id"] === "string" ? String(serviceObjArray["@id"]) : null) ||
    (serviceObjArray && typeof serviceObjArray.id === "string" ? String(serviceObjArray.id) : null) ||
    (typeof serviceJson.id === "string" ? serviceJson.id : null) ||
    (typeof serviceJson["@id"] === "string" ? String(serviceJson["@id"]) : null) ||
    (typeof serviceJson.url === "string" ? serviceJson.url : null) ||
    url.replace(/\/info\.json$/i, "");
  if (!serviceId) {
    throw new Error(`Unable to resolve IIIF image URL from service JSON: ${url}`);
  }

  const candidates = [
    `${serviceId.replace(/\/+$/g, "")}/full/full/0/default.jpg`,
    `${serviceId.replace(/\/+$/g, "")}/full/max/0/default.jpg`,
  ];
  for (const candidate of candidates) {
    const res = await fetchWithRetry(candidate, retries, backoffMs);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) {
      return { response: res, resolvedUrl: candidate };
    }
  }

  throw new Error(`IIIF service endpoint did not return an image binary for ${url}`);
}

export function deriveVaticanaManifestCandidates(sourceLink: string): string[] {
  const candidates = new Set<string>();
  try {
    const url = new URL(sourceLink);
    candidates.add(sourceLink);

    const viewPrefix = "/view/";
    if (url.pathname.includes(viewPrefix)) {
      const id = url.pathname.split(viewPrefix)[1]?.replace(/^\/+|\/+$/g, "");
      if (id) {
        candidates.add(`${url.origin}/iiif/${id}/manifest.json`);
      }
    }

    if (url.pathname.endsWith(".json")) {
      candidates.add(sourceLink);
    }
  } catch {
    candidates.add(sourceLink);
  }

  return Array.from(candidates);
}

function parseManifestCanvasImage(canvas: Record<string, unknown>): string | null {
  const items = canvas.items;
  if (Array.isArray(items)) {
    const annPage = items[0] as Record<string, unknown> | undefined;
    const annItems = annPage?.items;
    if (Array.isArray(annItems) && annItems.length > 0) {
      const anno = annItems[0] as Record<string, unknown>;
      const body = anno.body as Record<string, unknown> | undefined;
      const bodyId = (body?.id || body?.["@id"]) as string | undefined;
      if (bodyId) return bodyId;
    }
  }

  const images = canvas.images;
  if (Array.isArray(images) && images.length > 0) {
    const imageEntry = images[0] as Record<string, unknown>;
    const resource = imageEntry.resource as Record<string, unknown> | undefined;
    const resourceId = (resource?.["@id"] || resource?.id) as string | undefined;
    if (resourceId) return resourceId;
  }

  return null;
}

export function parseIiifImageUrls(manifest: Record<string, unknown>): string[] {
  const urls: string[] = [];

  const items = manifest.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      const url = parseManifestCanvasImage((item ?? {}) as Record<string, unknown>);
      if (url) urls.push(url);
    }
  }

  const sequences = manifest.sequences;
  if (urls.length === 0 && Array.isArray(sequences) && sequences.length > 0) {
    const canvases = (sequences[0] as Record<string, unknown>).canvases;
    if (Array.isArray(canvases)) {
      for (const canvas of canvases) {
        const url = parseManifestCanvasImage((canvas ?? {}) as Record<string, unknown>);
        if (url) urls.push(url);
      }
    }
  }

  return urls;
}

export async function fetchIiifManifestJson(input: {
  sourceLink: string;
  manifestUrl?: string;
  retries?: number;
  backoffMs?: number;
}): Promise<{ manifest: Record<string, unknown>; manifestUrl: string }> {
  const retries = input.retries ?? 2;
  const backoffMs = input.backoffMs ?? 500;
  const candidates = input.manifestUrl
    ? [input.manifestUrl, ...deriveVaticanaManifestCandidates(input.sourceLink)]
    : deriveVaticanaManifestCandidates(input.sourceLink);

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      const res = await fetchWithRetry(candidate, retries, backoffMs);
      const json = (await res.json()) as Record<string, unknown>;
      const urls = parseIiifImageUrls(json);
      if (urls.length === 0) {
        throw new Error("manifest has no canvases/images");
      }
      return { manifest: json, manifestUrl: candidate };
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Failed to resolve Vaticana manifest. ${errors.join(" | ")}`);
}

function extensionForResponse(url: string, contentType: string | null): string {
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("tiff")) return ".tif";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ext || ".jpg";
}

export async function downloadVaticanaPages(input: VaticanaFetchOptions): Promise<VaticanaFetchResult> {
  const retries = input.retries ?? 2;
  const backoffMs = input.backoffMs ?? 500;
  const minWidth = input.minWidth ?? 200;
  const minHeight = input.minHeight ?? 200;
  const startPage = Math.max(1, input.startPage);
  const pageCount = Math.max(1, input.pageCount);
  const endPage = startPage + pageCount - 1;

  const rawPagesDir = path.join(input.outDir, "raw-pages");
  ensureDir(rawPagesDir);

  const { manifest, manifestUrl } = await fetchIiifManifestJson({
    sourceLink: input.sourceLink,
    manifestUrl: input.manifestUrl,
    retries,
    backoffMs,
  });

  const imageUrls = parseIiifImageUrls(manifest);
  if (imageUrls.length === 0) {
    throw new Error("No image URLs found in IIIF manifest.");
  }

  if (startPage > imageUrls.length) {
    throw new Error(`Requested start page ${startPage} exceeds manifest page count ${imageUrls.length}.`);
  }

  const fetched: VaticanaFetchResult["fetchedPages"] = [];
  const stopPage = Math.min(endPage, imageUrls.length);

  for (let pageIndex = startPage; pageIndex <= stopPage; pageIndex += 1) {
    const imageUrl = imageUrls[pageIndex - 1];
    const { response: res, resolvedUrl } = await fetchImageResponseWithFallback(imageUrl, retries, backoffMs);
    const bytes = Buffer.from(await res.arrayBuffer());

    const ext = extensionForResponse(resolvedUrl, res.headers.get("content-type"));
    const localPath = path.join(rawPagesDir, `p${String(pageIndex).padStart(4, "0")}${ext}`);
    fs.writeFileSync(localPath, bytes);

    const meta = await sharp(localPath).metadata();
    const width = Number(meta.width ?? 0);
    const height = Number(meta.height ?? 0);
    if (!width || !height || width < minWidth || height < minHeight) {
      throw new Error(`Downloaded page ${pageIndex} is too small or invalid (${width}x${height}).`);
    }

    fetched.push({ pageIndex, imageUrl: resolvedUrl, localPath, width, height });
  }

  if (fetched.length === 0) {
    throw new Error("Vaticana download produced no pages.");
  }

  const savedAt = new Date().toISOString();
  const manifestOut = {
    witnessId: input.witnessId,
    sourceLink: input.sourceLink,
    manifestUrl,
    savedAt,
    startPage,
    requestedPageCount: pageCount,
    fetchedPageCount: fetched.length,
    pages: fetched.map((row) => ({
      pageIndex: row.pageIndex,
      imageUrl: row.imageUrl,
      fileName: path.basename(row.localPath),
      width: row.width,
      height: row.height,
    })),
  };

  const fetchManifestPath = path.join(input.outDir, "fetch-manifest.json");
  ensureDir(input.outDir);
  fs.writeFileSync(fetchManifestPath, `${JSON.stringify(manifestOut, null, 2)}\n`, "utf8");

  return {
    witnessId: input.witnessId,
    manifestUrl,
    sourceLink: input.sourceLink,
    fetchedPages: fetched,
    savedAt,
    rawPagesDir,
    fetchManifestPath,
  };
}
