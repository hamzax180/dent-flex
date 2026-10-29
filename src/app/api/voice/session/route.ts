import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { assertWithinBudget } from "@/lib/assistant/usage";
import { endCall, startCall } from "@/lib/assistant/voice";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"), conversationToken: z.string().min(8).max(100), language: z.enum(["en", "tr"]).default("en"), sdp: z.string().min(20).max(20_000),
    /** The call terms checkbox on screen; calls cannot start without it. */
    termsAccepted: z.literal(true, { errorMap: () => ({ message: "Please accept the call terms first." }) }),
  }),
  z.object({ action: z.literal("end"), conversationToken: z.string().min(8).max(100), seconds: z.number().min(0).max(7200) }),
]);

/**
 * POST /api/voice/session
 * start → forwards the browser's SDP offer to OpenAI Realtime with our key; returns the SDP answer.
 * end   → records the call duration once (usage/cost).
 */
export const POST = route(async (req) => {
  const body = schema.parse(await readJson(req, 24_000));
  if (body.action === "end") {
    await endCall(body.conversationToken, body.seconds);
    return NextResponse.json({ ok: true });
  }
  const ip = clientIp(req);
  await rateLimit(`voice:ip:${ip}`, 6, 600);
  await assertWithinBudget();
  const call = await startCall(body.conversationToken, body.language, body.sdp);
  return NextResponse.json(call);
});
