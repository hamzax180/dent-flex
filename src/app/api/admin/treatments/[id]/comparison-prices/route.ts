import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { createComparisonPrice } from "@/lib/services/pricing";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  market: z.string().regex(/^[A-Za-z]{2}$/, "Use a 2-letter country code, e.g. GB"),
  marketLabel: z.string().trim().min(2).max(80),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  minMinor: z.number().int().min(1).max(100_000_000),
  maxMinor: z.number().int().min(1).max(100_000_000),
  sourceName: z.string().trim().min(3, "Name the source").max(160),
  sourceUrl: z.string().url().max(500).nullable().optional(),
  checkedAt: z.coerce.date(),
});

/** POST /api/admin/treatments/:id/comparison-prices — admin enters a sourced reference price (draft). */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "prices:approve");
  const row = await createComparisonPrice((await params).id, schema.parse(await readJson(req)), staff, requestId);
  return NextResponse.json({ comparison: { id: row.id } }, { status: 201 });
});
