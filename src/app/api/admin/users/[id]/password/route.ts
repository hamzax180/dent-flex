import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff, hashPassword } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ password: z.string().min(12, "Use at least 12 characters.").max(200) }).strict();

/** POST /api/admin/users/:id/password — an admin sets a new password; the person is signed out everywhere. */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "users:manage");
  const { id } = await params;
  const { password } = schema.parse(await readJson(req));
  const user = await prisma.staffUser.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new ApiError("NOT_FOUND", "Staff member not found.");
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id }, data: { passwordHash } });
    await tx.staffSession.deleteMany({ where: { userId: id } });
    await audit(tx, { actorId: staff.id, action: "user.password_reset", entityType: "StaffUser", entityId: id, requestId });
  });
  return NextResponse.json({ ok: true });
});
