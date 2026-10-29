import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createLead } from "@/lib/services/leads";
import { POST as postLead } from "@/app/api/public/leads/route";
import { GET as listLeadsRoute } from "@/app/api/admin/leads/route";
import { GET as getLeadRoute, PATCH as patchLeadRoute } from "@/app/api/admin/leads/[id]/route";
import { POST as leadActionRoute } from "@/app/api/admin/leads/[id]/[action]/route";
import { POST as priceAction } from "@/app/api/admin/price-versions/[id]/[action]/route";
import { POST as confirmRoute } from "@/app/api/admin/appointment-requests/[id]/[action]/route";
import { GET as publicTreatments } from "@/app/api/public/treatments/route";
import { createPriceDraft, transitionPrice, getPublicTreatments } from "@/lib/services/pricing";
import { actAs, ctx, makeStaff, req, resetDb, validLead } from "./helpers";

beforeEach(resetDb);

describe("lead capture", () => {
  it("creates exactly one lead, with activity, consent and score, from a valid form", async () => {
    const res = await postLead(req("POST", "/api/public/leads", validLead(), { "idempotency-key": "abc-1" }), ctx({}));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.reference).toMatch(/^DF-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { publicId: body.reference }, include: { scores: true, consents: true, activities: true, appointmentRequests: true } });
    expect(lead.source).toBe("WEB_FORM");
    expect(lead.status).toBe("APPOINTMENT_REQUESTED");
    expect(lead.scores).toHaveLength(1);
    expect(lead.scoreTotal).toBe(25 + 20 + 15);
    expect(lead.consents.map((c) => `${c.channel}:${c.purpose}`)).toEqual(["EMAIL:SERVICE"]);
    expect(lead.activities.some((a) => a.type === "lead.created")).toBe(true);
    expect(lead.appointmentRequests[0].status).toBe("REQUESTED");
    expect(await prisma.appointment.count()).toBe(0); // a request is never a booking
  });

  it("is idempotent: a retried submission returns the same reference and creates one lead", async () => {
    const a = await (await postLead(req("POST", "/api/public/leads", validLead(), { "idempotency-key": "same" }), ctx({}))).json();
    const b = await (await postLead(req("POST", "/api/public/leads", validLead(), { "idempotency-key": "same" }), ctx({}))).json();
    expect(b.reference).toBe(a.reference);
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.appointmentRequest.count()).toBe(1);
  });

  it("handles concurrent duplicate submissions", async () => {
    const results = await Promise.all([1, 2, 3].map(() => createLead(validLead(), { source: "WEB_FORM", idempotencyKey: "race" }).catch((e) => e)));
    const refs = new Set(results.filter((r) => r.publicId).map((r) => r.publicId));
    expect(refs.size).toBe(1);
    expect(await prisma.lead.count()).toBe(1);
  });

  it("rejects a reused idempotency key with different details", async () => {
    await createLead(validLead(), { source: "WEB_FORM", idempotencyKey: "k" });
    await expect(createLead(validLead({ fullName: "Someone Else" }), { source: "WEB_FORM", idempotencyKey: "k" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("merges a repeat inquiry from the same contact instead of duplicating", async () => {
    await createLead(validLead({ appointmentIntent: false }), { source: "WEB_FORM" });
    await createLead(validLead({ appointmentIntent: false, phone: "+905551112233" }), { source: "TEXT_ASSISTANT" });
    expect(await prisma.lead.count()).toBe(1);
    const lead = await prisma.lead.findFirstOrThrow({ include: { activities: true } });
    expect(lead.phone).toBe("+905551112233");
    expect(lead.activities.some((a) => a.type === "lead.repeat_inquiry")).toBe(true);
  });

  it("validates on the server and never stores invalid submissions", async () => {
    const noContact = await postLead(req("POST", "/api/public/leads", validLead({ email: "", phone: "" })), ctx({}));
    expect(noContact.status).toBe(400);
    const body = await noContact.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.requestId).toBeTruthy();
    expect(body.error.fields.phone).toBeTruthy();
    const noNotice = await postLead(req("POST", "/api/public/leads", validLead({ privacyNoticeAccepted: false })), ctx({}));
    expect(noNotice.status).toBe(400);
    const bot = await postLead(req("POST", "/api/public/leads", validLead({ website: "http://spam" })), ctx({}));
    expect(bot.status).toBe(400);
    expect(await prisma.lead.count()).toBe(0);
  });

  it("ignores trusted fields sent by the browser (score, status, source)", async () => {
    const res = await postLead(req("POST", "/api/public/leads", { ...validLead({ appointmentIntent: false, bookingTimeframe: "" }), scoreTotal: 100, status: "WON", source: "REFERRAL" }), ctx({}));
    const { reference } = await res.json();
    const lead = await prisma.lead.findUniqueOrThrow({ where: { publicId: reference } });
    expect(lead.scoreTotal).toBe(15);
    expect(lead.status).toBe("NEW");
    expect(lead.source).toBe("WEB_FORM");
  });

  it("rate-limits repeated submissions from one IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await postLead(req("POST", "/api/public/leads", validLead({ email: `x${i}@example.com` }), { "x-forwarded-for": "9.9.9.9" }), ctx({}));
      statuses.push(r.status);
    }
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("CRM access control (enforced in the API, not the UI)", () => {
  it("requires authentication", async () => {
    await actAs(null);
    const res = await listLeadsRoute(req("GET", "/api/admin/leads"), ctx({}));
    expect(res.status).toBe(401);
  });

  it("blocks cross-site state changes", async () => {
    const rec = await makeStaff("RECEPTIONIST");
    await actAs(rec);
    const { leadId } = await createLead(validLead(), { source: "WEB_FORM" });
    const res = await patchLeadRoute(req("PATCH", `/api/admin/leads/${leadId}`, { status: "CONTACTED" }, { origin: "https://evil.example" }), ctx({ id: leadId }));
    expect(res.status).toBe(403);
  });

  it("lets reception update leads, add notes and tasks; clinicians cannot change leads", async () => {
    const rec = await makeStaff("RECEPTIONIST");
    const clin = await makeStaff("CLINICIAN");
    const { leadId } = await createLead(validLead({ appointmentIntent: false }), { source: "WEB_FORM" });

    await actAs(rec);
    const ok = await patchLeadRoute(req("PATCH", `/api/admin/leads/${leadId}`, { status: "CONTACTED", ownerId: rec.id }), ctx({ id: leadId }));
    expect(ok.status).toBe(200);
    expect((await leadActionRoute(req("POST", `/api/admin/leads/${leadId}/notes`, { body: "Called, will ring back" }), ctx({ id: leadId, action: "notes" }))).status).toBe(201);
    expect((await leadActionRoute(req("POST", `/api/admin/leads/${leadId}/tasks`, { title: "Call back", dueAt: new Date().toISOString() }), ctx({ id: leadId, action: "tasks" }))).status).toBe(201);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.firstResponseAt).not.toBeNull();
    expect(await prisma.auditEvent.count({ where: { action: "lead.updated" } })).toBe(1);

    await actAs(clin);
    const denied = await patchLeadRoute(req("PATCH", `/api/admin/leads/${leadId}`, { status: "QUALIFIED" }), ctx({ id: leadId }));
    expect(denied.status).toBe(403);
    expect(await prisma.auditEvent.count({ where: { action: "access.denied" } })).toBe(1);
  });

  it("scopes clinicians to their own leads and masks contact details", async () => {
    const clin = await makeStaff("CLINICIAN");
    const mine = await createLead(validLead({ email: "mine@example.com" }), { source: "WEB_FORM" });
    const other = await createLead(validLead({ email: "other@example.com" }), { source: "WEB_FORM" });
    await prisma.lead.update({ where: { id: mine.leadId }, data: { ownerId: clin.id } });

    await actAs(clin);
    const list = await (await listLeadsRoute(req("GET", "/api/admin/leads"), ctx({}))).json();
    expect(list.total).toBe(1);
    expect(list.rows[0].email).toBe("m***@example.com");
    expect((await getLeadRoute(req("GET", `/api/admin/leads/${other.leadId}`), ctx({ id: other.leadId }))).status).toBe(404);
    const detail = await (await getLeadRoute(req("GET", `/api/admin/leads/${mine.leadId}`), ctx({ id: mine.leadId }))).json();
    expect(detail.lead.latestFactors).toHaveLength(7);
  });

  it("filters and paginates on the server", async () => {
    const rec = await makeStaff("RECEPTIONIST");
    for (let i = 0; i < 12; i++) await createLead(validLead({ email: `p${i}@example.com`, appointmentIntent: i % 2 === 0 }), { source: "WEB_FORM" });
    await actAs(rec);
    const page = await (await listLeadsRoute(req("GET", "/api/admin/leads?pageSize=10&page=2"), ctx({}))).json();
    expect(page.total).toBe(12);
    expect(page.rows).toHaveLength(2);
    const req2 = await (await listLeadsRoute(req("GET", "/api/admin/leads?status=APPOINTMENT_REQUESTED"), ctx({}))).json();
    expect(req2.total).toBe(6);
    const search = await (await listLeadsRoute(req("GET", "/api/admin/leads?q=p11@"), ctx({}))).json();
    expect(search.total).toBe(1);
  });

  it("requires a reason for score overrides and keeps both values", async () => {
    const rec = await makeStaff("RECEPTIONIST");
    const { leadId } = await createLead(validLead(), { source: "WEB_FORM" });
    await actAs(rec);
    expect((await leadActionRoute(req("POST", `/api/admin/leads/${leadId}/score-override`, { total: 90 }), ctx({ id: leadId, action: "score-override" }))).status).toBe(400);
    expect((await leadActionRoute(req("POST", `/api/admin/leads/${leadId}/score-override`, { total: 90, reason: "Patient called twice today" }), ctx({ id: leadId, action: "score-override" }))).status).toBe(200);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { scores: true } });
    expect(lead.scoreOverride).toBe(90);
    expect(lead.scoreTotal).toBe(60);
    expect(lead.scores[0].overrideReason).toBe("Patient called twice today");
  });
});

describe("appointment requests vs confirmed appointments", () => {
  it("cannot mark a lead confirmed via a status change", async () => {
    const rec = await makeStaff("RECEPTIONIST");
    const { leadId } = await createLead(validLead(), { source: "WEB_FORM" });
    await actAs(rec);
    const res = await patchLeadRoute(req("PATCH", `/api/admin/leads/${leadId}`, { status: "APPOINTMENT_CONFIRMED" }), ctx({ id: leadId }));
    expect(res.status).toBe(409);
  });

  it("confirms only with an explicit staff attestation and a real time", async () => {
    const rec = await makeStaff("RECEPTIONIST");
    const { appointmentRequestId, leadId } = await createLead(validLead(), { source: "WEB_FORM" });
    await actAs(rec);
    const startAt = new Date(Date.now() + 3 * 86400_000).toISOString();
    const missing = await confirmRoute(req("POST", `/x`, { startAt }), ctx({ id: appointmentRequestId!, action: "confirm" }));
    expect(missing.status).toBe(400);
    const ok = await confirmRoute(req("POST", `/x`, { startAt, slotAgreed: true }), ctx({ id: appointmentRequestId!, action: "confirm" }));
    expect(ok.status).toBe(201);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { appointments: true, appointmentRequests: true } });
    expect(lead.status).toBe("APPOINTMENT_CONFIRMED");
    expect(lead.appointments[0].confirmedById).toBe(rec.id);
    expect(lead.appointmentRequests[0].appointmentId).toBe(lead.appointments[0].id);
    const again = await confirmRoute(req("POST", `/x`, { startAt, slotAgreed: true }), ctx({ id: appointmentRequestId!, action: "confirm" }));
    expect(again.status).toBe(409);
  });
});

describe("treatment price versioning", () => {
  it("only returns published, effective prices and keeps published versions immutable", async () => {
    const admin = await makeStaff("ADMIN");
    const rec = await makeStaff("RECEPTIONIST");
    const t = await prisma.treatment.create({ data: { slug: "whitening", nameEn: "Whitening", nameTr: "Beyazlatma", summaryEn: "s", summaryTr: "s", approved: true } });

    const draft = await createPriceDraft(t.id, { currency: "try", amountMinor: 500000, effectiveFrom: new Date(Date.now() - 1000) }, admin);
    expect((await getPublicTreatments())[0].price).toBeNull();
    await transitionPrice(draft.id, "APPROVED", admin);
    expect((await getPublicTreatments())[0].price).toBeNull(); // approved is not published

    await actAs(rec);
    expect((await priceAction(req("POST", "/x"), ctx({ id: draft.id, action: "publish" }))).status).toBe(403);
    await actAs(admin);
    expect((await priceAction(req("POST", "/x"), ctx({ id: draft.id, action: "publish" }))).status).toBe(200);
    const pub = await (await publicTreatments(req("GET", "/api/public/treatments"), ctx({}))).json();
    expect(pub.treatments[0].price.amountMinor).toBe(500000);
    expect(pub.treatments[0].price.currency).toBe("TRY");

    await expect(transitionPrice(draft.id, "APPROVED", admin)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    // A price change is a new version; publishing it supersedes the old one.
    const v2 = await createPriceDraft(t.id, { currency: "TRY", amountMinor: 650000, effectiveFrom: new Date(Date.now() - 500) }, admin);
    expect(v2.version).toBe(2);
    await transitionPrice(v2.id, "APPROVED", admin);
    await transitionPrice(v2.id, "PUBLISHED", admin);
    expect((await getPublicTreatments())[0].price!.amountMinor).toBe(650000);
    const old = await prisma.treatmentPriceVersion.findUniqueOrThrow({ where: { id: draft.id } });
    expect(old.amountMinor).toBe(500000);
    expect(old.effectiveTo).not.toBeNull();

    // A future-dated published price is not shown until it takes effect.
    const future = await createPriceDraft(t.id, { currency: "TRY", amountMinor: 1, effectiveFrom: new Date(Date.now() + 86400_000) }, admin);
    await transitionPrice(future.id, "APPROVED", admin);
    await transitionPrice(future.id, "PUBLISHED", admin);
    expect((await getPublicTreatments())[0].price!.amountMinor).toBe(650000);
  });
});
