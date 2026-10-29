import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

/**
 * Interest (engagement) score: how much effort a visitor has put into talking to us.
 * It is separate from the conversion-readiness score in scoring.ts and is built only from
 * behaviour (did they upload, call, compare prices…), never from what an image or message says.
 */
export const SIGNALS = {
  requested_plan: { points: 20, label: "Asked for a free treatment plan" },
  uploaded_xray: { points: 25, label: "Uploaded an X-ray" },
  uploaded_smile_photo: { points: 15, label: "Uploaded a smile photo" },
  uploaded_file: { points: 8, label: "Shared a file" },
  requested_appointment: { points: 15, label: "Asked for an appointment" },
  voice_call: { points: 10, label: "Called an agent" },
  voice_call_long: { points: 10, label: "Stayed on the call 2+ minutes" },
  shared_contact: { points: 10, label: "Shared phone or email" },
  viewed_prices: { points: 8, label: "Looked at price comparisons" },
  chose_treatment: { points: 5, label: "Picked a treatment category" },
  chat_engaged: { points: 8, label: "Chatted 6+ messages" },
  chat_deep: { points: 7, label: "Chatted 14+ messages" },
} as const;
export type SignalType = keyof typeof SIGNALS;
export const RETURNING = { points: 10, label: "Came back for another conversation" };

export type InterestBand = "VERY_INTERESTED" | "INTERESTED" | "BROWSING";
export const interestBand = (score: number): InterestBand => (score >= 55 ? "VERY_INTERESTED" : score >= 25 ? "INTERESTED" : "BROWSING");
export const BAND_TEXT: Record<InterestBand, string> = { VERY_INTERESTED: "Very interested", INTERESTED: "Interested", BROWSING: "Browsing" };

type Db = PrismaClient | Prisma.TransactionClient;
const cap = (n: number) => Math.min(100, n);

/** Sum of distinct signal types (each counts once), plus a bonus for coming back. */
export function scoreSignals(types: string[], conversations = 1) {
  const unique = [...new Set(types)].filter((t): t is SignalType => t in SIGNALS);
  return cap(unique.reduce((n, t) => n + SIGNALS[t].points, 0) + (conversations > 1 ? RETURNING.points : 0));
}

/** Record a signal once per conversation and refresh the conversation's and lead's score. */
export async function recordSignal(conversationId: string, ...types: SignalType[]) {
  if (!types.length) return;
  await prisma.engagementSignal.createMany({
    data: types.map((type) => ({ conversationId, type, points: SIGNALS[type].points })),
    skipDuplicates: true,
  });
  const conv = await refreshConversationInterest(prisma, conversationId);
  if (conv?.leadId) await refreshLeadInterest(prisma, conv.leadId);
}

export async function refreshConversationInterest(db: Db, conversationId: string) {
  const signals = await db.engagementSignal.findMany({ where: { conversationId }, select: { type: true } });
  return db.conversation.update({ where: { id: conversationId }, data: { interestScore: scoreSignals(signals.map((s) => s.type)) }, select: { leadId: true } });
}

/** Signals that belong to the lead itself (free plan requests and the files sent with them). */
async function leadLevelSignals(db: Db, leadId: string): Promise<SignalType[]> {
  const [plans, uploads] = await Promise.all([
    db.treatmentPlan.count({ where: { leadId } }),
    db.upload.findMany({ where: { leadId }, select: { kind: true }, distinct: ["kind"] }),
  ]);
  const kinds: Record<string, SignalType> = { XRAY: "uploaded_xray", SMILE_PHOTO: "uploaded_smile_photo", OTHER: "uploaded_file" };
  return [...(plans ? (["requested_plan"] as const) : []), ...uploads.map((u) => kinds[u.kind])];
}

export async function refreshLeadInterest(db: Db, leadId: string) {
  const convs = await db.conversation.findMany({ where: { leadId }, select: { signals: { select: { type: true } } } });
  const score = scoreSignals([...convs.flatMap((c) => c.signals.map((s) => s.type)), ...(await leadLevelSignals(db, leadId))], convs.length);
  await db.lead.update({ where: { id: leadId }, data: { interestScore: score } });
  return score;
}

/** Explainable breakdown for the lead page. */
export async function leadInterest(leadId: string) {
  const convs = await prisma.conversation.findMany({
    where: { leadId },
    select: { id: true, signals: { select: { type: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
  });
  const seen = new Map<string, Date>();
  for (const c of convs) for (const s of c.signals) if (!seen.has(s.type)) seen.set(s.type, s.createdAt);
  for (const t of await leadLevelSignals(prisma, leadId)) if (!seen.has(t)) seen.set(t, new Date());
  const items = [...seen.entries()]
    .filter(([t]) => t in SIGNALS)
    .map(([t, at]): { type: string; label: string; points: number; at: Date } => ({ type: t, label: SIGNALS[t as SignalType].label, points: SIGNALS[t as SignalType].points, at }));
  if (convs.length > 1) items.push({ type: "returning", label: RETURNING.label, points: RETURNING.points, at: new Date() });
  const score = cap(items.reduce((n, i) => n + i.points, 0));
  return { score, band: interestBand(score), items: items.sort((a, b) => b.points - a.points) };
}
