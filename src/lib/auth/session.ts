import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { StaffRole, StaffUser } from "@prisma/client";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { randomToken, sha256 } from "../ids";
import { can, type Permission } from "./rbac";
import { audit } from "../audit";

export const SESSION_COOKIE = "df_session";
const SESSION_HOURS = 12;

export type Staff = Pick<StaffUser, "id" | "email" | "name" | "role">;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyLogin(email: string, password: string, ip: string): Promise<StaffUser> {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const keys = [`ip:${ip}`, `email:${email}`];
  const failures = await prisma.loginAttempt.count({ where: { key: { in: keys }, success: false, createdAt: { gte: since } } });
  if (failures >= 10) throw new ApiError("RATE_LIMITED", "Too many sign-in attempts. Try again in 15 minutes.");

  const user = await prisma.staffUser.findUnique({ where: { email } });
  // Always run bcrypt to avoid revealing which emails exist via timing.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  await prisma.loginAttempt.createMany({ data: keys.map((key) => ({ key, success: Boolean(ok && user?.active) })) });
  if (!user || !ok || !user.active) throw new ApiError("UNAUTHENTICATED", "Email or password is incorrect.");
  return user;
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await prisma.staffSession.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.staffSession.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Returns the signed-in, active staff user or null. */
export async function getStaff(): Promise<Staff | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.staffSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, active: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await prisma.staffSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role };
}

/**
 * Same-origin check for state-changing requests (CSRF defence in depth on top
 * of SameSite=Lax cookies).
 */
function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    throw new ApiError("FORBIDDEN", "Cross-site request blocked.");
  }
}

export async function requireStaff(req: Request, perm?: Permission): Promise<Staff> {
  assertSameOrigin(req);
  const staff = await getStaff();
  if (!staff) throw new ApiError("UNAUTHENTICATED", "Please sign in.");
  if (perm && !can(staff.role, perm)) {
    await audit(prisma, { actorId: staff.id, action: "access.denied", entityType: "permission", entityId: perm });
    throw new ApiError("FORBIDDEN", "You do not have permission for this action.");
  }
  return staff;
}

export function hasRole(staff: Staff, ...roles: StaffRole[]) {
  return roles.includes(staff.role);
}
