import { NextResponse } from "next/server";
import { route, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { setComparisonStatus } from "@/lib/services/pricing";

type Ctx = { params: Promise<{ id: string; action: string }> };

/** POST /api/admin/comparison-prices/:id/{publish|unpublish} — admin only, audited. */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "prices:approve");
  const { id, action } = await params;
  if (action !== "publish" && action !== "unpublish") throw new ApiError("NOT_FOUND", "Unknown action.");
  await setComparisonStatus(id, action === "publish" ? "PUBLISHED" : "DRAFT", staff, requestId);
  return NextResponse.json({ ok: true });
});
