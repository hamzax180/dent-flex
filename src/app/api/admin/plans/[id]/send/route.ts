import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { sendPlan } from "@/lib/services/plans";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/admin/plans/:id/send — lock the plan and email the patient their private link. */
export const POST = route<Ctx>(async (req, { params }) => {
  const staff = await requireStaff(req, "leads:write");
  const base = process.env.APP_BASE_URL || new URL(req.url).origin;
  const result = await sendPlan(staff, (await params).id, base);
  return NextResponse.json(result);
});
