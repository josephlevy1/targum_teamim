import { NextResponse } from "next/server";
import { cloudRuntimeStatus, isCloudDeployment } from "@/lib/cloud-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = cloudRuntimeStatus();
  const ready = !isCloudDeployment() || (status.databaseConfigured && status.objectStorageConfigured && status.authenticationConfigured);

  return NextResponse.json(
    {
      ok: ready,
      runtime: isCloudDeployment() ? "cloud" : "local",
      checks: status,
    },
    { status: ready ? 200 : 503 },
  );
}
