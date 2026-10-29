import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ role: z.enum(["ADMIN", "RECEPTIONIST", "CLINICIAN"]).optional(), active: z.boolean().optional(), name: z.string().trim().min(2).max(120).optional() }).strict();

export const PATCH = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "users:manage");
  const { id } = await params;
  const patch = schema.parse(await readJson(req));
  if (id === staff.id && (patch.active === false || (patch.role && patch.role !== "ADMIN"))) {
    throw new ApiError("VALIDATION_ERROR", "You cannot remove your own admin access.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id }, data: patch });
    // Deactivation or role change ends existing sessions immediately.
    if (patch.role !== undefined || patch.active !== undefined) await tx.staffSession.deleteMany({ where: { userId: id } });
    await audit(tx, { actorId: staff.id, action: "user.updated", entityType: "StaffUser", entityId: id, data: patch, requestId });
  });
  return NextResponse.json({ ok: true });
});
