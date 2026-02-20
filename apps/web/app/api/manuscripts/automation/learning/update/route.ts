import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const acceptedSamples = Number(payload.acceptedSamples ?? 0);
  const previousQuality = Number(payload.previousQuality ?? 0.6);
  const updatedQuality = Math.min(0.95, previousQuality + acceptedSamples * 0.005);
  return NextResponse.json({
    ok: true,
    acceptedSamples,
    previousQuality,
    updatedQuality,
    model: "heuristic-v1",
  });
}
