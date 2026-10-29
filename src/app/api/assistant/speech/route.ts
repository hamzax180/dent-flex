import { z } from "zod";
import { route, readJson, ApiError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { assertWithinBudget } from "@/lib/assistant/usage";
import { speechTicket, synthesize, verifyTicket } from "@/lib/assistant/speech";
import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/db";

const schema = z.union([
  // Voice a reply the server produced (signed ticket from /api/assistant/messages).
  z.object({ text: z.string().min(1).max(700), lang: z.enum(["en", "tr"]), voice: z.string().max(20), sig: z.string().min(10).max(200) }),
  // The greeting that opens a voice conversation, in the assigned agent's voice.
  z.object({ greeting: z.literal(true), lang: z.enum(["en", "tr"]), conversationToken: z.string().max(100).optional() }),
]);

/** POST /api/assistant/speech → audio/mpeg. Only signed assistant text (or the greeting) is voiced. */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  await rateLimit(`tts:ip:${ip}`, 40, 600);
  const body = schema.parse(await readJson(req, 4_000));
  let text: string;
  let lang: "en" | "tr";
  let voice: string | undefined;
  let conversationId: string | null = null;
  if ("greeting" in body) {
    const conv = body.conversationToken
      ? await prisma.conversation.findUnique({ where: { publicToken: body.conversationToken }, include: { agent: true } })
      : null;
    const name = conv?.agent?.name ?? (await getSetting("sales_profile")).assistantName;
    lang = body.lang;
    const ticket = speechTicket(
      lang === "tr" ? `Merhaba, ben ${name}. Gülüşünüzde neyi değiştirmek istersiniz?` : `Hi, I'm ${name}. What would you love to change about your smile?`,
      lang,
      conv?.agent?.voice,
    );
    if (!ticket) throw new ApiError("UNAVAILABLE", "Natural voice is not configured.");
    text = ticket.text;
    voice = ticket.voice;
    conversationId = conv?.id ?? null;
  } else {
    if (!verifyTicket(body)) throw new ApiError("FORBIDDEN", "Invalid speech request.");
    text = body.text;
    lang = body.lang;
    voice = body.voice;
  }
  await assertWithinBudget();
  const audio = await synthesize(text, lang, conversationId, voice);
  return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
});
