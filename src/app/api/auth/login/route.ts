import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSession, verifyLogin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) });

export const POST = route(async (req, { requestId }) => {
  const ip = clientIp(req);
  await rateLimit(`login:${ip}`, 20, 300);
  const { email, password } = schema.parse(await readJson(req, 2_000));
  const user = await verifyLogin(email, password, ip);
  await createSession(user.id);
  await audit(prisma, { actorId: user.id, action: "auth.login", entityType: "StaffUser", entityId: user.id, requestId });
  return NextResponse.json({ ok: true });
});
