import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff, hashPassword } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(2).max(120),
  role: z.enum(["ADMIN", "RECEPTIONIST", "CLINICIAN"]),
  password: z.string().min(12, "Use at least 12 characters.").max(200),
});

export const GET = route(async (req) => {
  await requireStaff(req, "users:manage");
  const users = await prisma.staffUser.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, active: true, createdAt: true } });
  return NextResponse.json({ users });
});

export const POST = route(async (req, { requestId }) => {
  const staff = await requireStaff(req, "users:manage");
  const input = createSchema.parse(await readJson(req));
  try {
    const user = await prisma.staffUser.create({
      data: { email: input.email, name: input.name, role: input.role, passwordHash: await hashPassword(input.password) },
    });
    await audit(prisma, { actorId: staff.id, action: "user.created", entityType: "StaffUser", entityId: user.id, data: { role: user.role }, requestId });
    return NextResponse.json({ user: { id: user.id } }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ApiError("CONFLICT", "A staff member with that email already exists.");
    throw err;
  }
});
