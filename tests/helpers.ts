import { Prisma, type StaffRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/ids";
import { SESSION_COOKIE, type Staff } from "@/lib/auth/session";
import { testCookies } from "./setup";
import { MESSAGE_TEMPLATES, WORKFLOW_TEMPLATES } from "@/lib/automation/templates";

/** Wipe every table between tests (test database only). */
export async function resetDb() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  testCookies.clear();
}

const PW_HASH = bcrypt.hashSync("test-password-123", 4);

export async function makeStaff(role: StaffRole, name = role.toLowerCase()): Promise<Staff> {
  return prisma.staffUser.create({
    data: { email: `${name}-${randomToken(4)}@test.local`.toLowerCase(), name, role, passwordHash: PW_HASH },
    select: { id: true, email: true, name: true, role: true },
  });
}

/** Sign the test "browser" in as this staff member. */
export async function actAs(staff: Staff | null) {
  testCookies.clear();
  if (!staff) return;
  const token = randomToken();
  await prisma.staffSession.create({ data: { tokenHash: sha256(token), userId: staff.id, expiresAt: new Date(Date.now() + 3600_000) } });
  testCookies.set(SESSION_COOKIE, token);
}

export function req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json", host: "localhost:3000", origin: "http://localhost:3000", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });

export const validLead = (over: Record<string, unknown> = {}) => ({
  fullName: "Ayşe Test",
  email: "ayse@example.com",
  phone: "",
  language: "en",
  appointmentIntent: true,
  bookingTimeframe: "within two weeks",
  privacyNoticeAccepted: true,
  marketingOptIn: false,
  ...over,
});

export async function seedTemplatesPublished(keys?: string[]) {
  for (const t of MESSAGE_TEMPLATES) {
    if (keys && !keys.includes(t.key)) continue;
    await prisma.messageTemplate.create({ data: { ...t, version: 1, status: "PUBLISHED" } });
  }
}

export async function seedWorkflow(key: string, publishedBy: Staff, graphOverride?: unknown) {
  const tpl = WORKFLOW_TEMPLATES.find((w) => w.key === key)!;
  const graph = (graphOverride ?? tpl.graph) as Prisma.InputJsonValue;
  const wf = await prisma.workflow.create({ data: { name: tpl.name, templateKey: `${key}-${randomToken(3)}`, draftGraph: graph } });
  return wf;
}

export async function makeLead(over: Partial<Prisma.LeadUncheckedCreateInput> = {}) {
  return prisma.lead.create({
    data: { publicId: `DF-T${randomToken(4).toUpperCase()}`, fullName: "Lead Person", email: `p-${randomToken(4)}@example.com`.toLowerCase(), source: "WEB_FORM", ...over },
  });
}

export async function grant(leadId: string, channel: "EMAIL" | "WHATSAPP", purpose: "SERVICE" | "MARKETING") {
  await prisma.consentRecord.create({ data: { leadId, channel, purpose, status: "GRANTED", noticeVersion: "test", source: "test", grantedAt: new Date() } });
}

/** Make all pending jobs due now (simulates time passing for delays). */
export async function fastForwardJobs() {
  await prisma.job.updateMany({ where: { status: { in: ["PENDING", "FAILED"] } }, data: { runAt: new Date(Date.now() - 1000) } });
}
