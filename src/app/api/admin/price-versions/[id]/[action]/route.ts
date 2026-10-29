import { NextResponse } from "next/server";
import { route, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { transitionPrice } from "@/lib/services/pricing";

type Ctx = { params: Promise<{ id: string; action: string }> };

const MAP = { approve: "APPROVED", publish: "PUBLISHED", archive: "ARCHIVED" } as const;

/** POST /api/admin/price-versions/:id/{approve|publish|archive} — admin only. */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "prices:approve");
  const { id, action } = await params;
  const to = MAP[action as keyof typeof MAP];
  if (!to) throw new ApiError("NOT_FOUND", "Unknown action.");
  const v = await transitionPrice(id, to, staff, requestId);
  return NextResponse.json({ version: { id: v.id, status: v.status } });
});
