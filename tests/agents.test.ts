import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AGENT_SEED, agentPerformance, assignOrQueue, endConversation } from "@/lib/assistant/agents";
import { handleAssistantMessage } from "@/lib/assistant/assistant";
import { executeTool } from "@/lib/assistant/tools";
import { POST as sessionRoute } from "@/app/api/assistant/session/route";
import { PATCH as patchAgent } from "@/app/api/admin/ai-agents/[id]/route";
import { actAs, ctx, makeStaff, req, resetDb } from "./helpers";

beforeEach(resetDb);

async function seedAgents(n = 10, cap = 3) {
  for (const a of AGENT_SEED.slice(0, n)) await prisma.aiAgent.create({ data: { ...a, maxConcurrent: cap } });
  return prisma.aiAgent.findMany({ orderBy: { sortOrder: "asc" } });
}
let seq = 0;
const newConv = (language = "en") => prisma.conversation.create({ data: { publicToken: `t-${++seq}-${Math.random()}`, channel: "TEXT", language } });

describe("agent assignment and queue", () => {
  it("assigns a named agent and spreads load across agents", async () => {
    await seedAgents(3, 2);
    const states = [];
    for (let i = 0; i < 3; i++) states.push(await assignOrQueue((await newConv()).id));
    expect(states.every((s) => s.agent)).toBe(true);
    expect(new Set(states.map((s) => s.agent!.id)).size).toBe(3); // one each before doubling up
  });

  it("rotates strictly: 10 visitors in a row reach 10 different agents, in order, whatever their language", async () => {
    const agents = await seedAgents(10, 3);
    const got: string[] = [];
    for (let i = 0; i < 10; i++) got.push((await assignOrQueue((await newConv(i % 2 ? "tr" : "en")).id)).agent!.id);
    expect(got).toEqual(agents.map((a) => a.id));
  });

  it("keeps the distribution even over many visitors, even when chats end at different times", async () => {
    await seedAgents(10, 3);
    for (let i = 0; i < 30; i++) {
      const c = await newConv();
      await assignOrQueue(c.id);
      if (i % 3 === 0) await endConversation(c.publicToken); // some chats finish quickly
    }
    const perAgent = await prisma.conversation.groupBy({ by: ["agentId"], _count: true });
    expect(perAgent).toHaveLength(10);
    expect(perAgent.every((g) => g._count === 3)).toBe(true);
  });

  it("queues visitors first-come-first-served when every agent is at capacity, and frees slots on end", async () => {
    await seedAgents(2, 1);
    const a = await newConv(), b = await newConv(), c = await newConv(), d = await newConv();
    expect((await assignOrQueue(a.id)).agent).toBeTruthy();
    expect((await assignOrQueue(b.id)).agent).toBeTruthy();
    const qc = await assignOrQueue(c.id);
    const qd = await assignOrQueue(d.id);
    expect([qc.agent, qc.position]).toEqual([null, 1]);
    expect([qd.agent, qd.position]).toEqual([null, 2]);
    expect(qc.etaSeconds).toBeGreaterThan(0);

    // d polls first after a slot frees, but c was earlier in line: d must keep waiting.
    await endConversation(a.publicToken);
    expect((await assignOrQueue(d.id)).agent).toBeNull();
    expect((await assignOrQueue(c.id)).agent).toBeTruthy();
    expect((await assignOrQueue(d.id)).position).toBe(1);
  });

  it("never gives the last slot to two visitors at once", async () => {
    await seedAgents(1, 1);
    const convs = await Promise.all(Array.from({ length: 6 }, () => newConv()));
    const results = await Promise.all(convs.map((c) => assignOrQueue(c.id)));
    expect(results.filter((r) => r.agent).length).toBe(1);
    expect(await prisma.conversation.count({ where: { agentId: { not: null } } })).toBe(1);
  });

  it("skips paused agents and lets idle conversations release their slot", async () => {
    const [a1, a2] = await seedAgents(2, 1);
    await prisma.aiAgent.update({ where: { id: a2.id }, data: { active: false } });
    const first = await newConv();
    expect((await assignOrQueue(first.id)).agent!.id).toBe(a1.id);
    expect((await assignOrQueue((await newConv()).id)).agent).toBeNull();
    // The first visitor goes quiet for more than 10 minutes → slot is free again.
    await prisma.conversation.update({ where: { id: first.id }, data: { lastActivityAt: new Date(Date.now() - 11 * 60_000) } });
    await prisma.conversation.updateMany({ where: { agentId: null }, data: { lastActivityAt: new Date() } });
    const waiting = await prisma.conversation.findFirstOrThrow({ where: { agentId: null } });
    expect((await assignOrQueue(waiting.id)).agent!.id).toBe(a1.id);
  });
});

describe("talking to a named agent", () => {
  it("session API returns the agent or the queue position", async () => {
    await seedAgents(1, 1);
    const one = await (await sessionRoute(req("POST", "/api/assistant/session", { language: "en" }), ctx({}))).json();
    expect(one.status).toBe("assigned");
    expect(one.agent).toMatchObject({ slug: "defne", name: "Defne" });
    const two = await (await sessionRoute(req("POST", "/api/assistant/session", { language: "en" }), ctx({}))).json();
    expect(two).toMatchObject({ status: "queued", position: 1, agentsOnline: 1 });
    // Queued visitors can't chat yet.
    const blocked = await handleAssistantMessage({ conversationToken: two.conversationToken, message: "hello", language: "en" }).catch((e) => e);
    expect(blocked.code).toBe("CONFLICT");
    await sessionRoute(req("POST", "/api/assistant/session", { conversationToken: one.conversationToken, action: "end" }), ctx({}));
    const now = await (await sessionRoute(req("POST", "/api/assistant/session", { conversationToken: two.conversationToken, language: "en" }), ctx({}))).json();
    expect(now.status).toBe("assigned");
  });

  it("replies in the agent's name and is honest when asked if it is human", async () => {
    await seedAgents(2, 3);
    await prisma.aiAgent.update({ where: { slug: "defne" }, data: { active: false } });
    const s = await (await sessionRoute(req("POST", "/api/assistant/session", { language: "en" }), ctx({}))).json();
    const hi = await handleAssistantMessage({ conversationToken: s.conversationToken, message: "hello", language: "en" });
    expect(hi.agent?.name).toBe("Emre");
    expect(hi.reply).toContain("Emre");
    const honest = await handleAssistantMessage({ conversationToken: s.conversationToken, message: "Are you a real person?", language: "en", history: [{ role: "assistant", text: hi.reply }] });
    expect(honest.reply).toMatch(/AI care coordinator/);
    expect(honest.reply).not.toMatch(/I am (a )?(real )?(human|person)/i);
  });
});

describe("agent performance", () => {
  it("attributes leads and confirmed appointments to the agent that handled the conversation", async () => {
    const [defne] = await seedAgents(1, 3);
    const conv = await newConv();
    await assignOrQueue(conv.id);
    const r = await executeTool("createAppointmentRequest", { fullName: "Lena Weber", email: "lena@example.com" }, { conversationId: conv.id, language: "en", contactConsent: true, channel: "TEXT_ASSISTANT" });
    expect(r.ok).toBe(true);
    const lead = await prisma.lead.findFirstOrThrow();
    const admin = await makeStaff("ADMIN");
    await prisma.appointment.create({ data: { leadId: lead.id, startAt: new Date(Date.now() + 86400_000), endAt: new Date(Date.now() + 90000_000), confirmedById: admin.id } });
    const { agents } = await agentPerformance(new Date(Date.now() - 3600_000), new Date(Date.now() + 3600_000));
    expect(agents.find((a) => a.id === defne.id)).toMatchObject({ conversations: 1, leads: 1, appointmentRequests: 1, confirmed: 1, liveNow: 1, conversionRate: 1 });
  });

  it("only admins can change agents", async () => {
    const [defne] = await seedAgents(1);
    await actAs(await makeStaff("RECEPTIONIST"));
    expect((await patchAgent(req("PATCH", "/x", { active: false }), ctx({ id: defne.id }))).status).toBe(403);
    await actAs(await makeStaff("ADMIN"));
    expect((await patchAgent(req("PATCH", "/x", { maxConcurrent: 5, voice: "nova" }), ctx({ id: defne.id }))).status).toBe(200);
    expect(await prisma.aiAgent.findUniqueOrThrow({ where: { id: defne.id } })).toMatchObject({ maxConcurrent: 5, voice: "nova" });
    expect((await patchAgent(req("PATCH", "/x", { voice: "not-a-voice" }), ctx({ id: defne.id }))).status).toBe(400);
  });
});
