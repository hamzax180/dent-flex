import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { updatePlan } from "@/lib/services/plans";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/plans/:id — save line items, notes and validity (draft only). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const staff = await requireStaff(req, "leads:write");
  const plan = await updatePlan(staff, (await params).id, await readJson(req, 32_000));
  return NextResponse.json({ plan: { id: plan.id, status: plan.status } });
});
