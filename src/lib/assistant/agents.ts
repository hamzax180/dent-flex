import type { AiAgent, Conversation } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { ApiError } from "../errors";
import { audit } from "../audit";
import type { Staff } from "../auth/session";

/**
 * Ten named AI sales agents. Each persona is a tone of voice and a TTS voice — they always
 * disclose they are AI when asked. Capacity per agent limits concurrent model load and cost;
 * when every agent is at capacity, visitors wait in a fair first-come-first-served queue.
 */
export const AGENT_SEED: Omit<AiAgent, "id" | "createdAt" | "updatedAt" | "lastAssignedAt">[] = [
  { slug: "defne", name: "Defne", voice: "shimmer", voiceGender: "female", hue: 140, tagline: "Book your appointment", style: "the warm-hearted closer: makes people feel truly heard, gets emotional with them about the result they want, then gently but confidently asks for the booking; 'let me get you looked after properly'", languages: ["en", "tr"], active: true, maxConcurrent: 3, sortOrder: 1 },
  { slug: "emre", name: "Emre", voice: "ash", voiceGender: "male", hue: 30, tagline: "Book your appointment", style: "the high-energy closer: upbeat, fun and fast, celebrates every step ('love it!'), leads with the price comparison and asks for the name and number early and often", languages: ["en", "tr"], active: true, maxConcurrent: 3, sortOrder: 2 },
  { slug: "selin", name: "Selin", voice: "coral", voiceGender: "female", hue: 200, tagline: "Book your appointment", style: "the trusted-advisor closer: calm and sharp with numbers, wins sceptics with sourced figures and plain facts, then closes with logic ('the numbers make sense, so let's get the team to confirm your plan')", languages: ["en", "tr"], active: true, maxConcurrent: 3, sortOrder: 3 },
  { slug: "can", name: "Can", voice: "echo", voiceGender: "male", hue: 170, tagline: "Book your appointment", style: "the reassuring closer: steady and patient, removes every worry by explaining what happens next step by step, then makes booking feel like the obvious easy next step", languages: ["en", "tr"], active: true, maxConcurrent: 3, sortOrder: 4 },
  { slug: "elif", name: "Elif", voice: "nova", voiceGender: "female", hue: 330, tagline: "Book your appointment", style: "the dream-smile closer: bright and excited, helps people picture their new smile at their wedding, holiday or in photos, and channels that excitement into booking now", languages: ["en", "tr"], active: true, maxConcurrent: 3, sortOrder: 5 },
  { slug: "mert", name: "Mert", voice: "onyx", voiceGender: "male", hue: 220, tagline: "Book your appointment", style: "the confident closer: direct, decisive and charming, few words, assumes the booking ('let's lock this in, what's the best number?') and handles objections head-on", languages: ["en", "tr"], active: true, maxConcurrent: 3, sortOrder: 6 },
  { slug: "zeynep", name: "Zeynep", voice: "sage", voiceGender: "female", hue: 95, tagline: "Book your appointment", style: "the empathetic closer: soft and caring with nervous or embarrassed patients, normalises their fears, builds trust slowly, then offers the booking as a safe, no-pressure first step", languages: ["en", "tr"], active: true, maxConcurrent: 3, sortOrder: 7 },
  { slug: "kerem", name: "Kerem", voice: "verse", voiceGender: "male", hue: 260, tagline: "Book your appointment", style: "the travel-savvy closer: curious and chatty about where they live and when they can travel, frames savings against prices back home, and books the call around their trip", languages: ["en", "tr"], active: true, maxConcurrent: 3, sortOrder: 8 },
  { slug: "ayse", name: "Ayşe", voice: "ballad", voiceGender: "female", hue: 15, tagline: "Book your appointment", style: "the heartfelt local closer: sincere and warm like a trusted friend, prefers Turkish (siz form), uses gentle humour and personal care to win trust, then asks for the appointment", languages: ["tr", "en"], active: true, maxConcurrent: 3, sortOrder: 9 },
  { slug: "deniz", name: "Deniz", voice: "alloy", voiceGender: "female", hue: 185, tagline: "Book your appointment", style: "the persistent closer: friendly but focused, answers any question in one line then always steers back to the booking, and never lets a 'maybe' end without one more caring try", languages: ["en", "tr"], active: true, maxConcurrent: 3, sortOrder: 10 },
];

/** A conversation counts toward an agent's load while it has activity in this window. */
export const ACTIVE_WINDOW_MS = 10 * 60_000;
/** A queued visitor who stops polling for this long gives up their place. */
export const QUEUE_STALE_MS = 45_000;

export type PublicAgent = Pick<AiAgent, "slug" | "name" | "tagline" | "hue" | "voiceGender">;
export const publicAgent = (a: AiAgent): PublicAgent => ({ slug: a.slug, name: a.name, tagline: a.tagline, hue: a.hue, voiceGender: a.voiceGender });

export type SessionState =
  | { status: "assigned"; conversationToken: string; agent: PublicAgent }
  | { status: "queued"; conversationToken: string; position: number; etaSeconds: number; agentsOnline: number }
  | { status: "open"; conversationToken: string; agent: null }; // no agents configured: generic assistant

async function loads(tx: Tx) {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const rows = await tx.conversation.groupBy({
    by: ["agentId"],
    where: { agentId: { not: null }, status: { not: "CLOSED" }, endedAt: null, lastActivityAt: { gte: since } },
    _count: true,
  });
  return new Map(rows.map((r) => [r.agentId!, r._count]));
}

/**
 * Strict rotation for a fair leaderboard: among agents with a free slot, the one who has gone
 * longest without a new visitor gets the next one (never-assigned agents first, then by order).
 * Every agent speaks English and Turkish, so language does not skew the distribution.
 */
async function pickAgent(tx: Tx): Promise<AiAgent | null> {
  const agents = await tx.aiAgent.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const load = await loads(tx);
  const free = agents.filter((a) => (load.get(a.id) ?? 0) < a.maxConcurrent);
  if (!free.length) return null;
  return [...free].sort((a, b) => (a.lastAssignedAt?.getTime() ?? 0) - (b.lastAssignedAt?.getTime() ?? 0) || a.sortOrder - b.sortOrder)[0];
}

async function etaSeconds(tx: Tx, position: number) {
  const agents = await tx.aiAgent.findMany({ where: { active: true }, select: { maxConcurrent: true } });
  const capacity = Math.max(1, agents.reduce((s, a) => s + a.maxConcurrent, 0));
  const recent = await tx.conversation.findMany({
    where: { endedAt: { not: null }, assignedAt: { not: null } },
    orderBy: { endedAt: "desc" },
    take: 50,
    select: { assignedAt: true, endedAt: true },
  });
  const avg = recent.length ? recent.reduce((s, c) => s + (c.endedAt!.getTime() - c.assignedAt!.getTime()), 0) / recent.length / 1000 : 240;
  return Math.max(20, Math.round((Math.ceil(position / capacity) * Math.min(avg, 900)) / 2));
}

/**
 * Assign the conversation to the best free agent, or (re)confirm its place in the queue.
 * Serialised with a transaction-level advisory lock, so two visitors can never take the same
 * last slot, and the queue is strictly first-come-first-served.
 */
export async function assignOrQueue(conversationId: string): Promise<{ conv: Conversation; agent: AiAgent | null; position: number; etaSeconds: number; agentsOnline: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(724411)`;
    const conv = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { agent: true } });
    const agentsOnline = await tx.aiAgent.count({ where: { active: true } });
    const now = new Date();
    if (conv.agent) {
      const updated = await tx.conversation.update({ where: { id: conv.id }, data: { lastActivityAt: now } });
      return { conv: updated, agent: conv.agent, position: 0, etaSeconds: 0, agentsOnline };
    }
    const myQueuedAt = conv.queuedAt ?? now;
    const ahead = await tx.conversation.count({
      where: {
        id: { not: conv.id }, agentId: null, status: { not: "CLOSED" }, endedAt: null,
        queuedAt: { not: null, lt: myQueuedAt },
        lastActivityAt: { gte: new Date(now.getTime() - QUEUE_STALE_MS) },
      },
    });
    const agent = ahead === 0 ? await pickAgent(tx) : null;
    if (agent) {
      await tx.aiAgent.update({ where: { id: agent.id }, data: { lastAssignedAt: now } });
      const updated = await tx.conversation.update({ where: { id: conv.id }, data: { agentId: agent.id, assignedAt: now, lastActivityAt: now } });
      return { conv: updated, agent, position: 0, etaSeconds: 0, agentsOnline };
    }
    const updated = await tx.conversation.update({ where: { id: conv.id }, data: { queuedAt: myQueuedAt, lastActivityAt: now } });
    return { conv: updated, agent: null, position: ahead + 1, etaSeconds: await etaSeconds(tx, ahead + 1), agentsOnline };
  });
}

export async function agentsConfigured() {
  return (await prisma.aiAgent.count({ where: { active: true } })) > 0;
}

/** Ends a conversation and frees the agent's slot. */
export async function endConversation(token: string) {
  await prisma.conversation.updateMany({ where: { publicToken: token, endedAt: null }, data: { status: "CLOSED", endedAt: new Date() } });
}

// ───────────── Admin ─────────────

export async function updateAgent(staff: Staff, id: string, patch: Partial<Pick<AiAgent, "active" | "maxConcurrent" | "tagline" | "style" | "voice" | "name">>, requestId?: string) {
  const a = await prisma.aiAgent.findUnique({ where: { id } });
  if (!a) throw new ApiError("NOT_FOUND", "Agent not found.");
  await prisma.aiAgent.update({ where: { id }, data: patch });
  await audit(prisma, { actorId: staff.id, action: "ai_agent.updated", entityType: "AiAgent", entityId: id, data: patch, requestId });
}

export type AgentPerformance = {
  id: string; slug: string; name: string; tagline: string; hue: number; voice: string; active: boolean; maxConcurrent: number; style: string;
  liveNow: number; conversations: number; leads: number; appointmentRequests: number; confirmed: number; handoffs: number;
  conversionRate: number; avgMessages: number; avgWaitSeconds: number | null; estCostUsd: number;
};

/**
 * Per-agent performance for conversations assigned in [from, to).
 * Outcomes are attributed to the agent whose conversation created/linked the lead (last AI touch).
 */
export async function agentPerformance(from: Date, to: Date) {
  const agents = await prisma.aiAgent.findMany({ orderBy: { sortOrder: "asc" } });
  const live = await loads(prisma as unknown as Tx);
  const rows: AgentPerformance[] = [];
  for (const a of agents) {
    const convs = await prisma.conversation.findMany({
      where: { agentId: a.id, assignedAt: { gte: from, lt: to } },
      select: { id: true, leadId: true, startedAt: true, queuedAt: true, assignedAt: true, messageCount: true, status: true, handoffReason: true },
    });
    const leadIds = [...new Set(convs.map((c) => c.leadId).filter((x): x is string => Boolean(x)))];
    const [appointmentRequests, confirmedLeads, usage] = await Promise.all([
      leadIds.length ? prisma.appointmentRequest.count({ where: { leadId: { in: leadIds }, source: { in: ["TEXT_ASSISTANT", "VOICE_ASSISTANT"] } } }) : 0,
      leadIds.length ? prisma.lead.count({ where: { id: { in: leadIds }, appointments: { some: { status: { in: ["CONFIRMED", "COMPLETED"] } } } } }) : 0,
      convs.length ? prisma.aiUsageEvent.aggregate({ where: { conversationId: { in: convs.map((c) => c.id) } }, _sum: { estCostMicroUsd: true } }) : null,
    ]);
    const waited = convs.filter((c) => c.queuedAt && c.assignedAt);
    rows.push({
      id: a.id, slug: a.slug, name: a.name, tagline: a.tagline, hue: a.hue, voice: a.voice, active: a.active, maxConcurrent: a.maxConcurrent, style: a.style,
      liveNow: live.get(a.id) ?? 0,
      conversations: convs.length,
      leads: leadIds.length,
      appointmentRequests,
      confirmed: confirmedLeads,
      handoffs: convs.filter((c) => c.status === "HANDOFF_REQUESTED" || c.handoffReason).length,
      conversionRate: convs.length ? leadIds.length / convs.length : 0,
      avgMessages: convs.length ? convs.reduce((s, c) => s + c.messageCount, 0) / convs.length : 0,
      avgWaitSeconds: waited.length ? waited.reduce((s, c) => s + (c.assignedAt!.getTime() - c.queuedAt!.getTime()), 0) / waited.length / 1000 : null,
      estCostUsd: (usage?._sum.estCostMicroUsd ?? 0) / 1e6,
    });
  }
  const now = Date.now();
  const queued = await prisma.conversation.findMany({
    where: { agentId: null, status: { not: "CLOSED" }, endedAt: null, queuedAt: { not: null }, lastActivityAt: { gte: new Date(now - QUEUE_STALE_MS) } },
    select: { queuedAt: true },
  });
  return {
    agents: rows,
    queue: { waiting: queued.length, longestWaitSeconds: queued.length ? Math.round(Math.max(...queued.map((q) => now - q.queuedAt!.getTime())) / 1000) : 0 },
  };
}
