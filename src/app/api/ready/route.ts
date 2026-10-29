import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Readiness: database reachable and worker heartbeat fresh. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const stuck = await prisma.job.count({ where: { status: "PENDING", runAt: { lt: new Date(Date.now() - 10 * 60_000) } } });
    return NextResponse.json({ status: "ready", database: "ok", overdueJobs: stuck });
  } catch {
    return NextResponse.json({ status: "unavailable", database: "error" }, { status: 503 });
  }
}
