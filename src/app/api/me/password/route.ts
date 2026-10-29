import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff, hashPassword, SESSION_COOKIE } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/ids";
import { audit } from "@/lib/audit";

const schema = z
  .object({
    current: z.string().min(1).max(200),
    next: z.string().min(12, "Use at least 12 characters.").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "The new passwords don't match.", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "Choose a password you haven't just used.", path: ["next"] });

/** POST /api/me/password — change your own password; signs out your other sessions. */
export const POST = route(async (req, { requestId }) => {
  const staff = await requireStaff(req);
  await rateLimit(`pw:${staff.id}:${clientIp(req)}`, 5, 900);
  const input = schema.parse(await readJson(req, 2_000));
  const user = await prisma.staffUser.findUniqueOrThrow({ where: { id: staff.id } });
  if (!(await bcrypt.compare(input.current, user.passwordHash))) {
    throw new ApiError("VALIDATION_ERROR", "Your current password is incorrect.", { current: "Incorrect password" });
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await prisma.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: staff.id }, data: { passwordHash: await hashPassword(input.next) } });
    await tx.staffSession.deleteMany({ where: { userId: staff.id, tokenHash: { not: sha256(token) } } });
    await audit(tx, { actorId: staff.id, action: "auth.password_changed", entityType: "StaffUser", entityId: staff.id, requestId });
  });
  return NextResponse.json({ ok: true });
});
