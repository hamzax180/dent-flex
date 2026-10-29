import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { executeTool, looksUrgent } from "@/lib/assistant/tools";
import { handleAssistantMessage } from "@/lib/assistant/assistant";
import { createPriceDraft, transitionPrice, createComparisonPrice, setComparisonStatus, getPriceComparisons } from "@/lib/services/pricing";
import { POST as voiceSession } from "@/app/api/voice/session/route";
import { POST as assistantRoute } from "@/app/api/assistant/messages/route";
import { ctx, makeStaff, req, resetDb } from "./helpers";

beforeEach(resetDb);

async function conversation() {
  return prisma.conversation.create({ data: { publicToken: `tok-${Math.random()}`, channel: "TEXT" } });
}

describe("assistant tool gateway", () => {
  it("returns only published prices, never drafts", async () => {
    const admin = await makeStaff("ADMIN");
    const t = await prisma.treatment.create({ data: { slug: "implants", nameEn: "Implants", nameTr: "İmplant", summaryEn: "s", summaryTr: "s", approved: true } });
    await createPriceDraft(t.id, { currency: "EUR", amountMinor: 99900, effectiveFrom: new Date() }, admin);
    const conv = await conversation();
    const c = { conversationId: conv.id, language: "en" as const, contactConsent: false, channel: "TEXT_ASSISTANT" as const };
    const r1 = (await executeTool("getPublishedTreatmentPrices", {}, c)) as { treatments: { publishedPrice: string | null }[] };
    expect(r1.treatments[0].publishedPrice).toBeNull();

    const v = await prisma.treatmentPriceVersion.findFirstOrThrow();
    await transitionPrice(v.id, "APPROVED", admin);
    await transitionPrice(v.id, "PUBLISHED", admin);
    const r2 = (await executeTool("getPublishedTreatmentPrices", { treatment: "implant" }, c)) as { treatments: { publishedPrice: string | null }[] };
    expect(r2.treatments[0].publishedPrice).toContain("999");
  });

  it("validates arguments and rejects unknown tools", async () => {
    const conv = await conversation();
    const c = { conversationId: conv.id, language: "en" as const, contactConsent: true, channel: "TEXT_ASSISTANT" as const };
    expect(await executeTool("runSql", { q: "DROP TABLE" }, c)).toEqual({ error: "unknown_tool" });
    expect(await executeTool("createLead", { fullName: 42 }, c)).toMatchObject({ error: "invalid_arguments" });
  });

  it("refuses to create a lead without the visitor's consent tick", async () => {
    const conv = await conversation();
    const res = await executeTool("createLead", { fullName: "Can Demir", phone: "+905551234567" }, { conversationId: conv.id, language: "tr", contactConsent: false, channel: "TEXT_ASSISTANT" });
    expect(res).toMatchObject({ error: "consent_required" });
    expect(await prisma.lead.count()).toBe(0);
  });

  it("creates leads through the shared service, idempotently, linked to the conversation", async () => {
    const conv = await conversation();
    const c = { conversationId: conv.id, language: "tr" as const, contactConsent: true, channel: "TEXT_ASSISTANT" as const };
    const args = { fullName: "Can Demir", phone: "+905551234567", bookingTimeframe: "next month" };
    const a = await executeTool("createAppointmentRequest", args, c);
    const b = await executeTool("createAppointmentRequest", args, c);
    expect(a).toMatchObject({ ok: true, status: "appointment_requested_not_confirmed" });
    expect(b.reference).toBe(a.reference);
    const lead = await prisma.lead.findFirstOrThrow({ include: { conversations: true, appointmentRequests: true } });
    expect(lead.source).toBe("TEXT_ASSISTANT");
    expect(lead.language).toBe("tr");
    expect(lead.conversations[0].id).toBe(conv.id);
    expect(lead.appointmentRequests).toHaveLength(1);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("hands off to staff with a task when a lead exists", async () => {
    const conv = await conversation();
    const c = { conversationId: conv.id, language: "en" as const, contactConsent: true, channel: "TEXT_ASSISTANT" as const };
    await executeTool("createLead", { fullName: "Jo Smith", email: "jo@example.com" }, c);
    await executeTool("handoffToStaff", { reason: "clinical_question" }, c);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).status).toBe("HANDOFF_REQUESTED");
    expect(await prisma.task.count({ where: { title: { contains: "clinical question" } } })).toBe(1);
  });

  it("does not store summaries unless retention is enabled", async () => {
    const conv = await conversation();
    const r = await executeTool("recordConversationSummary", { summary: "Asked about opening hours." }, { conversationId: conv.id, language: "en", contactConsent: false, channel: "TEXT_ASSISTANT" });
    expect(r).toMatchObject({ ok: false });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).summary).toBeNull();
  });
});

describe("assistant safety and fallback", () => {
  it("routes urgent symptoms to emergency guidance and handoff without the model", async () => {
    expect(looksUrgent("my face is swollen and I have a fever")).toBe(true);
    expect(looksUrgent("Dişimde şişlik var")).toBe(true);
    expect(looksUrgent("what are your opening hours")).toBe(false);
    const r = await handleAssistantMessage({ message: "heavy bleeding after extraction", language: "en" });
    expect(r.handoff).toBe(true);
    expect(r.reply).toContain("112");
  });

  it("labels the development fallback and never invents prices", async () => {
    const r = await handleAssistantMessage({ message: "How much do veneers cost?", language: "en" });
    expect(r.mode).toBe("mock");
    expect(r.reply).toMatch(/where are you based/i);
    expect(r.reply).not.toMatch(/\d{2,}/);
    expect(r.cards.some((c) => c.type === "comparison")).toBe(false);
  });

  it("does not store transcripts by default", async () => {
    await handleAssistantMessage({ message: "Do I need an account?", language: "en" });
    expect(await prisma.messageEvent.count()).toBe(0);
  });

  it("voice is unavailable (and falls back) when not enabled — no key is ever returned", async () => {
    const res = await voiceSession(req("POST", "/api/voice/session", { action: "start", conversationToken: "test-token-123", language: "en", sdp: "v=0 o=- 0 0 IN IP4 127.0.0.1", termsAccepted: true }), ctx({}));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/sk-/);
    expect(body.error.message).toMatch(/chat|contact form/);
  });

  it("refuses to start a call before the call terms are accepted", async () => {
    const res = await voiceSession(req("POST", "/api/voice/session", { action: "start", conversationToken: "test-token-123", language: "en", sdp: "v=0 o=- 0 0 IN IP4 127.0.0.1" }), ctx({}));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed call request", async () => {
    const res = await voiceSession(req("POST", "/api/voice/session", { action: "start", conversationToken: "x" }), ctx({}));
    expect(res.status).toBe(400);
  });

  it("returns a safe error shape for invalid input", async () => {
    const res = await assistantRoute(req("POST", "/api/assistant/messages", { message: "" }), ctx({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("sales coordinator: sourced price comparisons", () => {
  async function setup(currency = "EUR") {
    const admin = await makeStaff("ADMIN");
    const t = await prisma.treatment.create({ data: { slug: "implants", nameEn: "Dental implants", nameTr: "Diş implantı", summaryEn: "s", summaryTr: "s", approved: true } });
    const v = await createPriceDraft(t.id, { currency: "EUR", minMinor: 60000, maxMinor: 90000, effectiveFrom: new Date(Date.now() - 1000) }, admin);
    const cmp = await createComparisonPrice(t.id, { market: "gb", marketLabel: "United Kingdom (private)", currency, minMinor: 250000, maxMinor: 350000, sourceName: "Test fee survey 2026", sourceUrl: "https://example.org/survey", checkedAt: new Date("2026-10-01") }, admin);
    return { admin, t, v, cmp };
  }

  it("shows nothing until BOTH our price and the reference price are published", async () => {
    const { admin, v, cmp } = await setup();
    expect(await getPriceComparisons()).toHaveLength(0);
    await transitionPrice(v.id, "APPROVED", admin);
    await transitionPrice(v.id, "PUBLISHED", admin);
    expect(await getPriceComparisons()).toHaveLength(0); // reference still draft
    await setComparisonStatus(cmp.id, "PUBLISHED", admin);
    const [c] = await getPriceComparisons({ market: "GB" });
    expect(c.market).toBe("GB");
    expect(c.savings).toEqual({ minMinor: 250000 - 90000, maxMinor: 350000 - 60000, percentMid: 75 });
    expect(c.source.name).toBe("Test fee survey 2026");
    expect(await prisma.auditEvent.count({ where: { action: "comparison_price.published" } })).toBe(1);
  });

  it("never computes a saving across different currencies", async () => {
    const { admin, v, cmp } = await setup("GBP");
    await transitionPrice(v.id, "APPROVED", admin);
    await transitionPrice(v.id, "PUBLISHED", admin);
    await setComparisonStatus(cmp.id, "PUBLISHED", admin);
    const [c] = await getPriceComparisons();
    expect(c.savings).toBeNull();
  });

  it("the agent quotes the sourced comparison with a card when asked about price from a country", async () => {
    const { admin, v, cmp } = await setup();
    await transitionPrice(v.id, "APPROVED", admin);
    await transitionPrice(v.id, "PUBLISHED", admin);
    await setComparisonStatus(cmp.id, "PUBLISHED", admin);
    const r = await handleAssistantMessage({
      message: "How much are implants? I live in the UK",
      language: "en",
      history: [{ role: "assistant", text: "Hi!" }],
    });
    const card = r.cards.find((c) => c.type === "comparison");
    expect(card).toBeTruthy();
    expect(r.reply).toContain("Test fee survey 2026");
    expect(r.reply).toMatch(/consultation/i);
    expect(r.reply).not.toMatch(/\b(best|cheapest|guarantee)/i);
  });

  it("does not quote a draft reference price", async () => {
    const { admin, v } = await setup();
    await transitionPrice(v.id, "APPROVED", admin);
    await transitionPrice(v.id, "PUBLISHED", admin);
    const conv = await conversation();
    const res = await executeTool("getPriceComparison", { market: "GB" }, { conversationId: conv.id, language: "en", contactConsent: false, channel: "TEXT_ASSISTANT" });
    expect(res).toMatchObject({ comparisons: [] });
  });
});

describe("sales coordinator: discovery and closing", () => {
  it("only uses approved selling points", async () => {
    const r = await handleAssistantMessage({ message: "Why should I choose you?", language: "en", history: [{ role: "assistant", text: "Hi" }] });
    const reasons = r.cards.find((c) => c.type === "reasons");
    expect(reasons && reasons.type === "reasons" && reasons.items.length).toBeGreaterThan(0);
    expect(r.reply).not.toMatch(/\b(best|cheapest|number one)\b/i);
  });

  it("asks for consent before sending, then creates exactly one appointment request", async () => {
    const history = [
      { role: "assistant" as const, text: "Hi" },
      { role: "user" as const, text: "I'm interested in veneers" },
    ];
    const ask = { message: "Yes please book it. My name is Sarah Jones, +44 7700 900123", language: "en" as const, history };
    const noConsent = await handleAssistantMessage(ask);
    expect(noConsent.reply).toMatch(/tick the consent box/i);
    expect(await prisma.lead.count()).toBe(0);

    const ok = await handleAssistantMessage({ ...ask, contactConsent: true, conversationToken: noConsent.conversationToken });
    expect(ok.cards.find((c) => c.type === "confirmation")).toBeTruthy();
    expect(ok.reply).toMatch(/not a confirmed booking/i);
    const again = await handleAssistantMessage({ ...ask, contactConsent: true, conversationToken: noConsent.conversationToken });
    expect(again.reference).toBe(ok.reference);
    const leads = await prisma.lead.findMany({ include: { appointmentRequests: true } });
    expect(leads).toHaveLength(1);
    expect(leads[0].fullName).toBe("Sarah Jones");
    expect(leads[0].appointmentRequests).toHaveLength(1);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("speaks briefly in voice mode and records the voice channel", async () => {
    const r = await handleAssistantMessage({ message: "hello", language: "en", mode: "voice" });
    expect(r.reply.split(/[.!?]/).filter((s) => s.trim()).length).toBeLessThanOrEqual(3);
    const conv = await prisma.conversation.findFirstOrThrow();
    expect(conv.channel).toBe("VOICE");
  });
});
