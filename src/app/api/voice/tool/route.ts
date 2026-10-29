import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson, ApiError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { executeTool } from "@/lib/assistant/tools";
import { cardFor } from "@/lib/assistant/assistant";

const schema = z.object({
  conversationToken: z.string().min(8).max(100),
  name: z.string().max(60),
  arguments: z.string().max(4_000),
  language: z.enum(["en", "tr"]).default("en"),
  /** From the on-screen checkbox — the voice model cannot set this. */
  contactConsent: z.boolean().default(false),
});

/**
 * POST /api/voice/tool — a tool call proposed by the voice model during a call.
 * Same allowlist, argument validation, consent rule and idempotency as text chat.
 */
export const POST = route(async (req) => {
  const body = schema.parse(await readJson(req, 8_000));
  await rateLimit(`voicetool:ip:${clientIp(req)}`, 30, 60);
  const conv = await prisma.conversation.findUnique({ where: { publicToken: body.conversationToken } });
  if (!conv || conv.status === "CLOSED") throw new ApiError("NOT_FOUND", "Conversation not found.");
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(body.arguments || "{}");
  } catch {
    args = {};
  }
  const result = await executeTool(body.name, args, { conversationId: conv.id, language: body.language, contactConsent: body.contactConsent, channel: "VOICE_ASSISTANT" });
  await prisma.conversation.update({ where: { id: conv.id }, data: { lastActivityAt: new Date() } });
  const card = await cardFor(body.name, args, result, body.language);
  return NextResponse.json({ output: result, card });
});
