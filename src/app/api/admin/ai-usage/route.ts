import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { spendSince } from "@/lib/assistant/usage";

export const GET = route(async (req) => {
  await requireStaff(req, "ai_usage:read");
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const byKind = await prisma.aiUsageEvent.groupBy({
    by: ["kind", "model"],
    where: { createdAt: { gte: month } },
    _sum: { inputTokens: true, outputTokens: true, durationSeconds: true, estCostMicroUsd: true },
    _count: true,
  });
  return NextResponse.json({
    note: "Estimates from configured rates (AI_*_USD_* env vars). Verify against the provider's billing dashboard.",
    todayUsd: await spendSince(day),
    monthUsd: await spendSince(month),
    caps: { daily: Number(process.env.AI_DAILY_BUDGET_USD ?? 10), monthly: Number(process.env.AI_MONTHLY_BUDGET_USD ?? 200) },
    byKind: byKind.map((b) => ({ kind: b.kind, model: b.model, events: b._count, ...b._sum })),
  });
});
