import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { POST as planRequest } from "@/app/api/public/plan-requests/route";
import { PATCH as planPatch } from "@/app/api/admin/plans/[id]/route";
import { POST as planSend } from "@/app/api/admin/plans/[id]/send/route";
import { POST as planAccept } from "@/app/api/public/plans/[token]/accept/route";
import { GET as uploadGet } from "@/app/api/admin/uploads/[id]/route";
import { POST as contentCreate } from "@/app/api/admin/content/[kind]/route";
import { planByToken } from "@/lib/services/plans";
import { leadInterest } from "@/lib/interest";
import { actAs, ctx, makeStaff, req, resetDb } from "./helpers";

beforeEach(resetDb);

// Smallest valid PNG (1×1) and something that only claims to be an image.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082", "hex");
const file = (bytes: Buffer, name: string, type: string) => new File([new Uint8Array(bytes)], name, { type });

function planForm(over: Record<string, string | File> = {}) {
  const fd = new FormData();
  const fields: Record<string, string | File> = {
    fullName: "Sarah Test", email: "sarah@example.com", phone: "", language: "en", country: "United Kingdom",
    privacyNoticeAccepted: "true", uploadConsent: "true", file0: file(PNG, "xray.png", "image/png"), kind0: "XRAY", ...over,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost:3000/api/public/plan-requests", { method: "POST", body: fd, headers: { host: "localhost:3000", origin: "http://localhost:3000" } });
}

async function makeRequest() {
  const res = await planRequest(planForm(), ctx({}));
  expect(res.status).toBe(201);
  return prisma.treatmentPlan.findFirstOrThrow({ include: { uploads: true, lead: true } });
}

describe("free treatment plan", () => {
  it("creates a lead, a plan, the uploaded file, a task and the interest signal", async () => {
    const plan = await makeRequest();
    expect(plan.status).toBe("REQUESTED");
    expect(plan.uploads).toHaveLength(1);
    expect(plan.uploads[0].leadId).toBe(plan.leadId);
    expect(await prisma.task.count({ where: { dedupeKey: `plan:${plan.id}` } })).toBe(1);
    const interest = await leadInterest(plan.leadId);
    expect(interest.items.map((i) => i.type)).toEqual(expect.arrayContaining(["requested_plan", "uploaded_xray"]));
    expect(plan.lead.interestScore).toBeGreaterThanOrEqual(45);
  });

  it("rejects a file that isn't really an image and writes nothing", async () => {
    const res = await planRequest(planForm({ file0: file(Buffer.from("not an image at all"), "x.png", "image/png") }), ctx({}));
    expect(res.status).toBe(400);
    expect(await prisma.lead.count()).toBe(0);
    expect(await prisma.treatmentPlan.count()).toBe(0);
  });

  it("requires the upload consent", async () => {
    const res = await planRequest(planForm({ uploadConsent: "false" }), ctx({}));
    expect(res.status).toBe(400);
  });

  it("only staff can open the patient's files", async () => {
    const plan = await makeRequest();
    await actAs(null);
    expect((await uploadGet(req("GET", `/api/admin/uploads/${plan.uploads[0].id}`), ctx({ id: plan.uploads[0].id }))).status).toBe(401);
    await actAs(await makeStaff("RECEPTIONIST"));
    const ok = await uploadGet(req("GET", `/api/admin/uploads/${plan.uploads[0].id}`), ctx({ id: plan.uploads[0].id }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
  });

  it("draft → send locks the plan; the private link works once sent and records the first view", async () => {
    const plan = await makeRequest();
    expect(await planByToken(plan.token)).toBeNull(); // not visible before sending
    await actAs(await makeStaff("RECEPTIONIST"));
    const items = [{ treatment: "Dental implant", area: "36", qty: 2, unitMinor: 50000, currency: "EUR" }];
    expect((await planPatch(req("PATCH", `/api/admin/plans/${plan.id}`, { items, notes: "Two implants", validUntil: "2026-12-31" }), ctx({ id: plan.id }))).status).toBe(200);
    const sent = await planSend(req("POST", `/api/admin/plans/${plan.id}/send`), ctx({ id: plan.id }));
    expect(sent.status).toBe(200);
    expect((await sent.json()).link).toContain(`/plan/${plan.token}`);

    // Sent plans can't be edited
    const again = await planPatch(req("PATCH", `/api/admin/plans/${plan.id}`, { items: [] }), ctx({ id: plan.id }));
    expect(again.status).toBe(409);

    expect(await planByToken("unknown-token-unknown-token")).toBeNull();
    const view = await planByToken(plan.token);
    expect(view?.items[0].qty).toBe(2);
    const firstView = (await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: plan.id } })).viewedAt;
    await planByToken(plan.token);
    expect((await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: plan.id } })).viewedAt).toEqual(firstView);

    const accepted = await planAccept(req("POST", `/api/public/plans/${plan.token}/accept`), ctx({ token: plan.token }));
    expect(accepted.status).toBe(200);
    expect((await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("ACCEPTED");
  });

  it("can't send an empty plan", async () => {
    const plan = await makeRequest();
    await actAs(await makeStaff("RECEPTIONIST"));
    expect((await planSend(req("POST", `/api/admin/plans/${plan.id}/send`), ctx({ id: plan.id }))).status).toBe(409);
  });
});

describe("reviews", () => {
  it("won't publish a review without the patient's permission", async () => {
    await actAs(await makeStaff("ADMIN"));
    const body = { author: "Sarah K.", quote: "Lovely team", rating: 5, status: "PUBLISHED", consent: false };
    expect((await contentCreate(req("POST", "/api/admin/content/reviews", body), ctx({ kind: "reviews" }))).status).toBe(400);
    expect((await contentCreate(req("POST", "/api/admin/content/reviews", { ...body, consent: true }), ctx({ kind: "reviews" }))).status).toBe(201);
    expect((await prisma.testimonial.findFirstOrThrow()).consentAt).not.toBeNull();
  });
});
