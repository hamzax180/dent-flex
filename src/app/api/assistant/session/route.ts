import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getConversation } from "@/lib/assistant/assistant";
import { agentsConfigured, assignOrQueue, endConversation, publicAgent } from "@/lib/assistant/agents";

const schema = z.object({
  conversationToken: z.string().max(100).nullable().optional(),
  language: z.enum(["en", "tr"]).default("en"),
  action: z.enum(["join", "end"]).default("join"),
});

/**
 * POST /api/assistant/session
 * join → assigns a named agent, or returns the visitor's place in the queue (poll every few seconds).
 * end  → frees the agent for the next visitor.
 */
export const POST = route(async (req) => {
  const input = schema.parse(await readJson(req, 2_000));
  if (input.action === "end") {
    if (input.conversationToken) await endConversation(input.conversationToken);
    return NextResponse.json({ status: "ended" });
  }
  await rateLimit(`session:ip:${clientIp(req)}`, 60, 60); // polling while queued is ~20/min
  const conv = await getConversation(input.conversationToken, input.language, "TEXT");
  if (!(await agentsConfigured())) return NextResponse.json({ status: "open", conversationToken: conv.publicToken, agent: null });
  const s = await assignOrQueue(conv.id);
  if (s.agent) return NextResponse.json({ status: "assigned", conversationToken: conv.publicToken, agent: publicAgent(s.agent) });
  return NextResponse.json({ status: "queued", conversationToken: conv.publicToken, position: s.position, etaSeconds: s.etaSeconds, agentsOnline: s.agentsOnline });
});
