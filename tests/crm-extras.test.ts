import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { POST as createLeadRoute } from "@/app/api/admin/leads/route";
import { PATCH as patchTask } from "@/app/api/admin/tasks/[id]/route";
import { POST as createTaskRoute } from "@/app/api/admin/tasks/route";
import { POST as contentCreate } from "@/app/api/admin/content/[kind]/route";
import { PATCH as contentPatch, DELETE as contentDelete } from "@/app/api/admin/content/[kind]/[id]/route";
import { POST as changePassword } from "@/app/api/me/password/route";
import { POST as confirmRoute } from "@/app/api/admin/appointment-requests/[id]/[action]/route";
import { GET as publicFaqs } from "@/app/api/public/faqs/route";
import { createLead } from "@/lib/services/leads";
import { actAs, ctx, makeStaff, req, resetDb, validLead } from "./helpers";
import { testCookies } from "./setup";

beforeEach(resetDb);

const phoneLead = (over: Record<string, unknown> = {}) => ({
  fullName: "Mehmet Kaya", phone: "+90 532 000 11 22", email: "", language: "tr", source: "PHONE",
  treatmentSlug: "not-sure", appointmentIntent: true, bookingTimeframe: "bu ay", noticeGiven: true, ...over,
});

describe("staff-entered leads (phone / walk-in)", () => {
  it("creates a lead with the staff member as owner and records who gave the notice", async () => {
    const rec = await makeStaff("RECEPTIONIST", "Ayla");
    await actAs(rec);
    const res = await createLeadRoute(req("POST", "/api/admin/leads", phoneLead()), ctx({}));
    expect(res.status).toBe(201);
    const { lead } = await res.json();
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { consents: true, appointmentRequests: true, activities: true } });
    expect(row.source).toBe("PHONE");
    expect(row.ownerId).toBe(rec.id);
    expect(row.phone).toBe("+905320001122");
    expect(row.appointmentRequests).toHaveLength(1);
    expect(row.consents[0]).toMatchObject({ purpose: "SERVICE", actorId: rec.id });
    expect(row.consents[0].evidence).toContain("Ayla");
    expect(row.consents.some((c) => c.purpose === "MARKETING")).toBe(false); // never assumed
    expect(row.activities.find((a) => a.type === "lead.created")?.actorId).toBe(rec.id);
  });

  it("requires the privacy-notice attestation and a contact method", async () => {
    await actAs(await makeStaff("RECEPTIONIST"));
    expect((await createLeadRoute(req("POST", "/api/admin/leads", phoneLead({ noticeGiven: false })), ctx({}))).status).toBe(400);
    expect((await createLeadRoute(req("POST", "/api/admin/leads", phoneLead({ phone: "" })), ctx({}))).status).toBe(400);
    expect(await prisma.lead.count()).toBe(0);
  });

  it("merges with an existing inquiry from the same phone instead of duplicating", async () => {
    await createLead(validLead({ email: "", phone: "+905320001122" }), { source: "WEB_FORM" });
    await actAs(await makeStaff("RECEPTIONIST"));
    const res = await (await createLeadRoute(req("POST", "/api/admin/leads", phoneLead()), ctx({}))).json();
    expect(res.lead.merged).toBe(true);
    expect(await prisma.lead.count()).toBe(1);
  });

  it("is not available to clinicians", async () => {
    await actAs(await makeStaff("CLINICIAN"));
    expect((await createLeadRoute(req("POST", "/api/admin/leads", phoneLead()), ctx({}))).status).toBe(403);
  });
});

describe("tasks", () => {
  it("creates a standalone task due at a clinic-local time and marks it done", async () => {
    const rec = await makeStaff("RECEPTIONIST");
    await actAs(rec);
    const res = await createTaskRoute(req("POST", "/api/admin/tasks", { title: "Call the lab", dueAt: "2026-12-01T09:30" }), ctx({}));
    expect(res.status).toBe(201);
    const t = await prisma.task.findFirstOrThrow();
    expect(t.leadId).toBeNull();
    expect(t.dueAt.toISOString()).toBe("2026-12-01T06:30:00.000Z"); // 09:30 Istanbul = 06:30 UTC
    expect((await patchTask(req("PATCH", `/x`, { status: "DONE" }), ctx({ id: t.id }))).status).toBe(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).completedAt).not.toBeNull();
  });

  it("returns 404 (not 500) for a malformed id", async () => {
    await actAs(await makeStaff("RECEPTIONIST"));
    const res = await patchTask(req("PATCH", `/x`, { status: "DONE" }), ctx({ id: "not-a-uuid" }));
    expect(res.status).toBe(404);
  });

  it("an unscoped task list includes lead-linked tasks (regression: empty relation filter)", async () => {
    const { leadId } = await createLead(validLead(), { source: "WEB_FORM" });
    await prisma.task.create({ data: { leadId, title: "Linked", dueAt: new Date() } });
    await prisma.task.create({ data: { title: "Standalone", dueAt: new Date() } });
    expect(await prisma.task.count({ where: { AND: [{}, { status: "OPEN" }] } })).toBe(2);
  });
});

describe("appointment times are clinic time, not browser time", () => {
  it("interprets a datetime-local value in Europe/Istanbul", async () => {
    const rec = await makeStaff("RECEPTIONIST");
    const { appointmentRequestId } = await createLead(validLead(), { source: "WEB_FORM" });
    await actAs(rec);
    const res = await confirmRoute(req("POST", "/x", { startAt: "2027-03-10T14:30", slotAgreed: true }), ctx({ id: appointmentRequestId!, action: "confirm" }));
    expect(res.status).toBe(201);
    expect((await prisma.appointment.findFirstOrThrow()).startAt.toISOString()).toBe("2027-03-10T11:30:00.000Z");
  });
});

describe("website content editor", () => {
  it("is admin-only", async () => {
    await actAs(await makeStaff("RECEPTIONIST"));
    const res = await contentCreate(req("POST", "/x", { questionEn: "Q", answerEn: "A", questionTr: "S", answerTr: "C" }), ctx({ kind: "faqs" }));
    expect(res.status).toBe(403);
  });

  it("publishes FAQs to the site and audits changes", async () => {
    await actAs(await makeStaff("ADMIN"));
    const created = await (await contentCreate(req("POST", "/x", { questionEn: "Do you offer sedation?", answerEn: "Ask our team.", questionTr: "Sedasyon var mı?", answerTr: "Ekibimize sorun." }), ctx({ kind: "faqs" }))).json();
    expect((await (await publicFaqs(req("GET", "/api/public/faqs"), ctx({}))).json()).faqs).toHaveLength(0); // draft by default
    await contentPatch(req("PATCH", "/x", { questionEn: "Do you offer sedation?", answerEn: "Ask our team.", questionTr: "Sedasyon var mı?", answerTr: "Ekibimize sorun.", status: "PUBLISHED" }), ctx({ kind: "faqs", id: created.id }));
    expect((await (await publicFaqs(req("GET", "/api/public/faqs"), ctx({}))).json()).faqs).toHaveLength(1);
    expect((await contentDelete(req("DELETE", "/x"), ctx({ kind: "faqs", id: created.id }))).status).toBe(200);
    expect(await prisma.auditEvent.count({ where: { action: { startsWith: "content.faqs." } } })).toBe(3);
  });

  it("creates treatments with a unique URL name and refuses to delete them", async () => {
    await actAs(await makeStaff("ADMIN"));
    const body = { slug: "root-canal", nameEn: "Root canal", nameTr: "Kanal tedavisi", summaryEn: "Approved text.", summaryTr: "Onaylı metin.", approved: true };
    const a = await contentCreate(req("POST", "/x", body), ctx({ kind: "treatments" }));
    expect(a.status).toBe(201);
    expect((await contentCreate(req("POST", "/x", body), ctx({ kind: "treatments" }))).status).toBe(409);
    const { id } = await a.json();
    expect((await contentDelete(req("DELETE", "/x"), ctx({ kind: "treatments", id }))).status).toBe(400);
  });
});

describe("change own password", () => {
  it("requires the current password, then signs out other sessions only", async () => {
    const admin = await makeStaff("ADMIN");
    await actAs(admin);
    const myCookie = [...testCookies.entries()];
    await prisma.staffSession.create({ data: { tokenHash: "other-device", userId: admin.id, expiresAt: new Date(Date.now() + 3600_000) } });

    const wrong = await changePassword(req("POST", "/x", { current: "nope", next: "a-much-longer-password", confirm: "a-much-longer-password" }), ctx({}));
    expect(wrong.status).toBe(400);
    const mismatch = await changePassword(req("POST", "/x", { current: "test-password-123", next: "a-much-longer-password", confirm: "different-password-x" }), ctx({}));
    expect(mismatch.status).toBe(400);

    for (const [k, v] of myCookie) testCookies.set(k, v);
    const ok = await changePassword(req("POST", "/x", { current: "test-password-123", next: "a-much-longer-password", confirm: "a-much-longer-password" }), ctx({}));
    expect(ok.status).toBe(200);
    const user = await prisma.staffUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(await bcrypt.compare("a-much-longer-password", user.passwordHash)).toBe(true);
    expect(await prisma.staffSession.count({ where: { userId: admin.id } })).toBe(1); // only this session remains
    expect(await prisma.auditEvent.count({ where: { action: "auth.password_changed" } })).toBe(1);
  });
});
