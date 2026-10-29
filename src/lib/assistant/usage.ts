import { prisma } from "../db";
import { ApiError } from "../errors";

// Cost figures are ESTIMATES from rates you configure after checking the official
// pricing page (https://openai.com/api/pricing/). Nothing here hardcodes a historical price.
const rate = (name: string) => Number(process.env[name] ?? 0);

export function estimateTextCostMicroUsd(inputTokens: number, outputTokens: number) {
  return Math.round(inputTokens * rate("AI_TEXT_INPUT_USD_PER_1M") + outputTokens * rate("AI_TEXT_OUTPUT_USD_PER_1M"));
}

export function estimateVoiceCostMicroUsd(seconds: number) {
  return Math.round((seconds / 60) * rate("AI_VOICE_USD_PER_MINUTE") * 1_000_000);
}

export async function recordTextUsage(res: { id: string; usage?: { prompt_tokens: number; completion_tokens: number } | null }, conversationId: string, model: string, provider = "openai") {
  const input = res.usage?.prompt_tokens ?? 0;
  const output = res.usage?.completion_tokens ?? 0;
  // providerEventId is unique: a retried write cannot double-count.
  await prisma.aiUsageEvent.upsert({
    where: { providerEventId: `${provider}:${res.id}` },
    update: {},
    create: { kind: "TEXT", provider, model, providerEventId: `${provider}:${res.id}`, conversationId, inputTokens: input, outputTokens: output, estCostMicroUsd: estimateTextCostMicroUsd(input, output) },
  });
}

export async function spendSince(since: Date) {
  const agg = await prisma.aiUsageEvent.aggregate({ where: { createdAt: { gte: since } }, _sum: { estCostMicroUsd: true } });
  return (agg._sum.estCostMicroUsd ?? 0) / 1_000_000;
}

/** Refuse new AI work when the estimated daily or monthly budget is used up. */
export async function assertWithinBudget() {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [d, m] = await Promise.all([spendSince(day), spendSince(month)]);
  const dailyCap = Number(process.env.AI_DAILY_BUDGET_USD ?? 10);
  const monthlyCap = Number(process.env.AI_MONTHLY_BUDGET_USD ?? 200);
  if (d >= dailyCap || m >= monthlyCap) {
    throw new ApiError("BUDGET_EXCEEDED", "The assistant is resting for today. Please use the contact form or call the clinic.");
  }
  return { day: d, month: m, dailyCap, monthlyCap };
}
