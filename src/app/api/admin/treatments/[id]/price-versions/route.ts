import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { createPriceDraft } from "@/lib/services/pricing";

type Ctx = { params: Promise<{ id: string }> };

const minor = z.number().int().min(0).max(100_000_000).nullable().optional();
const schema = z
  .object({
    currency: z.string().regex(/^[A-Za-z]{3}$/),
    amountMinor: minor,
    minMinor: minor,
    maxMinor: minor,
    inclusions: z.string().max(500).optional(),
    exclusions: z.string().max(500).optional(),
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().nullable().optional(),
  })
  .refine((v) => v.amountMinor != null || (v.minMinor != null && v.maxMinor != null), { message: "Give a single price or a min/max range.", path: ["amountMinor"] })
  .refine((v) => v.minMinor == null || v.maxMinor == null || v.minMinor <= v.maxMinor, { message: "Minimum must not exceed maximum.", path: ["minMinor"] })
  .refine((v) => !v.effectiveTo || v.effectiveTo > v.effectiveFrom, { message: "End must be after start.", path: ["effectiveTo"] });

export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "treatments:manage");
  const v = await createPriceDraft((await params).id, schema.parse(await readJson(req)), staff, requestId);
  return NextResponse.json({ version: { id: v.id, version: v.version, status: v.status } }, { status: 201 });
});
