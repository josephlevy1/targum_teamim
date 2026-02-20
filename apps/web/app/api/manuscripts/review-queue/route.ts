import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repository";

const cache = new Map<string, { ts: number; payload: unknown }>();
const CACHE_TTL_MS = 5_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = (searchParams.get("filter")?.trim() ??
    "low_confidence") as "low_confidence" | "disagreement" | "unavailable_partial";
  if (!["low_confidence", "disagreement", "unavailable_partial"].includes(filter)) {
    return NextResponse.json({ error: "Invalid filter." }, { status: 400 });
  }

  const repo = getRepository();
  const key = `queue:${filter}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  const payload = {
    filter,
    items: repo.listTextReviewQueue(filter),
  };
  cache.set(key, { ts: now, payload });
  return NextResponse.json(payload);
}
