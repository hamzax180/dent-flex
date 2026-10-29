import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { settingSchema } from "@/lib/settings";

type Ctx = { params: Promise<{ key: string }> };

export const PUT = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "settings:manage");
  const { key } = await params;
  const schema = settingSchema(key);
  if (!schema) throw new ApiError("NOT_FOUND", "Unknown setting.");
  const value = schema.parse(await readJson(req, 32_000)) as Prisma.InputJsonValue;
  await prisma.$transaction(async (tx) => {
    await tx.clinicSetting.upsert({ where: { key }, update: { value, updatedById: staff.id }, create: { key, value, updatedById: staff.id } });
    await audit(tx, { actorId: staff.id, action: "settings.updated", entityType: "ClinicSetting", entityId: key, requestId });
  });
  return NextResponse.json({ ok: true });
});
