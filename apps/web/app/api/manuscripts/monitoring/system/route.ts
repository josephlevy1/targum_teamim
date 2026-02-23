import { NextResponse } from "next/server";
import { getSystemTelemetry } from "@/lib/manuscripts-pipeline";

export async function GET() {
  const telemetry = getSystemTelemetry();
  return NextResponse.json({ generatedAt: new Date().toISOString(), telemetry });
}
