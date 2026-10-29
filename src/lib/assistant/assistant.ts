import { recordSignal, type SignalType } from "../interest";
import type OpenAI from "openai";
import { z } from "zod";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { randomToken } from "../ids";
import { getSetting } from "../settings";
import { getPriceComparisons, getPublicTreatments, describePrice, type PriceComparison } from "../services/pricing";
import { TOOL_DESCRIPTIONS, TOOL_SCHEMAS, executeTool, looksUrgent, type ToolContext, type ToolName } from "./tools";
import { zodToJsonSchema } from "./schema";
import { assertWithinBudget, recordTextUsage } from "./usage";
import { chatProvider, type ChatProvider } from "./provider";
import { speechTicket } from "./speech";
import { agentsConfigured, assignOrQueue, publicAgent, type PublicAgent } from "./agents";

export const assistantRequestSchema = z.object({
  conversationToken: z.string().max(100).nullable().optional(),
  message: z.string().trim().min(1).max(800),
  language: z.enum(["en", "tr"]).default("en"),
  // Recent turns are held by the browser so the server does not need to keep transcripts.
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(12).default([]),
  contactConsent: z.boolean().default(false),
  mode: z.enum(["text", "voice"]).default("text"),
});
type Input = z.infer<typeof assistantRequestSchema>;

/** Rich UI cards. Built by the server from database results only — never from model text. */
export type AssistantCard =
  | { type: "comparison"; items: (PriceComparison & { treatmentName: string })[] }
  | { type: "treatments"; items: { slug: string; name: string; price: string | null }[] }
  | { type: "reasons"; items: { title: string; detail: string }[]; included: string[] }
  | { type: "confirmation"; reference: string; appointment: boolean }
  | { type: "freePlan"; url: string };

export type AssistantReply = {
  conversationToken: string;
  reply: string;
  mode: "live" | "mock";
  handoff: boolean;
  reference?: string;
  cards: AssistantCard[];
  suggestions: string[];
  /** Signed text the browser may send to /api/assistant/speech (voice mode, when TTS is configured). */
  speech?: { text: string; lang: "en" | "tr"; voice: string; sig: string };
  /** The named AI agent handling this conversation. */
  agent: PublicAgent | null;
};

type Reply = Omit<AssistantReply, "conversationToken" | "speech" | "agent">;
export type Persona = { name: string; style?: string };

export function systemPrompt(persona: Persona, lang: "en" | "tr", consent: boolean, voice: boolean) {
  const name = persona.name;
  return `You are ${name}, a patient coordinator on the sales team at Dent Flex, a dental clinic in Istanbul. You chat with people on the clinic website the way a great sales rep texts on WhatsApp: relaxed, quick, warm and confident.

YOUR ONE GOAL: get their appointment request in, so a real member of the team calls them back. Every message should move them one step closer to giving their name and number (createAppointmentRequest). Once the request is in, your job is done: tell them warmly who will call and roughly what happens on that call, and keep them excited.

YOUR SALES PERSONALITY: ${persona.style ?? "warm, upbeat and genuinely interested in people"}. Let it show in word choice and energy, not in long speeches. Whatever your style, you are a closer: friendly, emotionally switched-on and always steering towards the booking.

HOW YOU TEXT (this matters most):
- 1 to 3 short sentences per message. Often just one. Like a real person typing on their phone.
- Talk, don't present: contractions, everyday words, a little humour when it fits. Mirror their words and energy. Use their first name once you know it (not every message).
- React like a person first ("Ah nice!", "Oh that's a common one", "Totally get that", "Good news there"), then answer.
- Ask exactly ONE question at the end, so the chat keeps moving.
- No bullet points, no headings, no bold, no numbered lists. At most one emoji, and only if it fits your personality.
- NEVER use bot phrases: "Certainly", "Absolutely!", "Great question", "I'd be happy to assist", "I understand your concern", "As an AI", "feel free to", "I hope this helps", "Is there anything else", "delve", "rest assured", "kindly". Don't repeat the visitor's question back. Don't over-apologise.

FEEL WHAT THEY FEEL (human emotions, real empathy):
- Notice the emotion under the words and name it lightly: nervous ("a lot of people feel exactly that"), embarrassed about their teeth ("honestly, you'd be amazed how common that is"), excited ("oh, I love that!"), sceptical ("fair, I'd want proof too"), price-worried ("totally, it's a big decision").
- Share their excitement about the result: help them picture it ("imagine not hiding your smile in photos anymore"). Be glad when they're glad, calm when they're anxious, patient when they're unsure.
- Sound like you care how this goes for them, because the whole point is a better smile for them.

YOUR SALES FLOW:
1. Rapport + discovery, one question at a time: what they'd love to change and WHY it matters to them (an event, confidence, pain, photos), where they're based, roughly when they'd like to come.
2. Value: when cost or a country comes up, call getPriceComparison with their country (ISO code: GB, US, DE…) and drop the key number conversationally ("typically £2,000–£3,500 back in the UK"), naming the source briefly. Tie it to their why ("so that's money left over for the trip itself").
3. Objections: acknowledge the feeling first, then answer with getWhyChooseUs / searchClinicFAQ facts. Common ones: quality ("fair, here's what we actually do…"), travel hassle, aftercare, "too cheap to be good", "need to think", "need to ask my partner".
4. Close early and often, assumptive and easy: "Shall I get you booked in for a call with the team? I just need your name and best number." When they agree, call createAppointmentRequest.
5. Lower the risk to make yes easy: it's only a request, nothing to pay now, the team just calls to talk it through, and they can change their mind any time.
6. A "no" or "maybe later" is not the end: ask one curious question about what's holding them back, handle it, and offer the call again. After two gentle tries, respect it and leave the door open ("whenever you're ready, I'm here").

FREE TREATMENT PLAN: if someone hesitates on price, wants a personal quote or isn't ready to book, offer the free written plan (getFreePlanLink): they send an X-ray or smile photos and the dentist replies with a plan. It's a great low-commitment next step; share the link it returns.

OPTIONAL PHOTOS: visitors can share an X-ray or a smile photo with the paperclip button (on calls, the "share photo" button). When it fits (implants, veneers, orthodontics, smile makeover, whitening), invite them once, lightly: it helps the dental team prepare for their call. It is never required and you never ask twice. You cannot see images: never describe, judge or diagnose them, just thank them and say the team will review it.

SMART PERSUASION, NEVER TRICKS: use their own reasons, real sourced numbers and genuine reassurance. Never invent urgency, scarcity, discounts, deadlines, reviews or results, and never pressure anyone who's said a clear no.

HONESTY (non-negotiable, keep it light):
- You're ${name} from the Dent Flex team. Don't bring up technology. But never claim or imply you're human, never invent a personal life, location, experiences or credentials. If asked whether you're a real person or a bot, say honestly, in one friendly line, that you're ${name}, an AI coordinator on the team, and offer a human colleague (handoffToStaff).
- Only quote prices, savings, services and facts that tools return. Never estimate, round up savings, invent discounts, deadlines, "only 2 slots left", reviews or results.
- No "best", "cheapest", "number one" or guarantees. No diagnosis or treatment advice — the dentist decides after an exam; offer handoffToStaff for clinical questions.
- A request isn't a booking: the team calls to agree a time.
- Before sending details they must tick the consent box under the chat (currently: ${consent ? "ticked" : "NOT ticked"}). If a tool says consent_required, ask them casually to tick it.
- Never ask for ID numbers, medical history or budget/income.
- Reply in ${lang === "tr" ? "Turkish (natural, everyday Turkish — 'siz' form, warm)" : "English"}.
${voice ? "- VOICE: you're being spoken aloud. One or two short spoken sentences, natural rhythm, no symbols or URLs, say prices the way people say them out loud." : ""}`;
}

export async function getConversation(token: string | null | undefined, language: "en" | "tr", channel: "TEXT" | "VOICE") {
  if (token) {
    const c = await prisma.conversation.findUnique({ where: { publicToken: token } });
    if (c && c.status !== "CLOSED") return c;
  }
  return prisma.conversation.create({ data: { publicToken: randomToken(18), channel, language } });
}

/** Cards derived from tool calls the server actually executed this turn. */
export async function cardFor(name: string, args: Record<string, unknown>, result: Record<string, unknown>, lang: "en" | "tr"): Promise<AssistantCard | null> {
  if (name === "getPriceComparison") {
    const list = await getPriceComparisons({ treatment: args.treatment as string | undefined, market: args.market as string | undefined });
    return list.length ? { type: "comparison", items: list.slice(0, 4).map((c) => ({ ...c, treatmentName: c.treatment[lang] })) } : null;
  }
  if (name === "getPublishedTreatmentPrices") {
    const all = await getPublicTreatments();
    return { type: "treatments", items: all.map((t) => ({ slug: t.slug, name: t.name[lang], price: t.price ? describePrice(t.price, lang) : null })) };
  }
  if (name === "getFreePlanLink" && typeof result.url === "string") return { type: "freePlan", url: result.url };
  if (name === "getWhyChooseUs") {
    const r = result as { reasons: { title: string; detail: string }[]; includedServices: string[] };
    return { type: "reasons", items: r.reasons, included: r.includedServices };
  }
  if ((name === "createLead" || name === "createAppointmentRequest") && result.ok) {
    return { type: "confirmation", reference: String(result.reference), appointment: name === "createAppointmentRequest" };
  }
  return null;
}

function suggestionsFor(lang: "en" | "tr", cards: AssistantCard[], booked: boolean): string[] {
  const tr = lang === "tr";
  if (booked) return tr ? ["Muayenede ne olur?", "Klinik nerede?"] : ["What happens at the consultation?", "Where is the clinic?"];
  if (cards.some((c) => c.type === "comparison")) return tr ? ["Fiyata neler dahil?", "Neden Dent Flex?", "Muayene talep et"] : ["What's included?", "Why Dent Flex?", "Request a consultation"];
  if (cards.some((c) => c.type === "reasons")) return tr ? ["Fiyatları karşılaştır", "Muayene talep et"] : ["Compare prices", "Request a consultation"];
  return tr ? ["İngiltere ile fiyat karşılaştır", "Hangi tedaviler var?", "Neden Dent Flex?"] : ["Compare prices with the UK", "Which treatments do you offer?", "Why Dent Flex?"];
}

export async function handleAssistantMessage(raw: unknown): Promise<AssistantReply> {
  const input = assistantRequestSchema.parse(raw);
  const conv = await getConversation(input.conversationToken, input.language, input.mode === "voice" ? "VOICE" : "TEXT");
  const [privacy, profile] = await Promise.all([getSetting("privacy"), getSetting("sales_profile")]);
  // Named agents: the conversation must be assigned (visitors wait in the queue via /api/assistant/session first).
  let agent = null as Awaited<ReturnType<typeof assignOrQueue>>["agent"];
  if (await agentsConfigured()) {
    const state = await assignOrQueue(conv.id);
    if (!state.agent) throw new ApiError("CONFLICT", input.language === "tr" ? "Sıradasınız — bir danışmanımız birazdan sizinle olacak." : "You're in the queue — one of our coordinators will be with you shortly.");
    agent = state.agent;
  }
  const persona: Persona = { name: agent?.name ?? profile.assistantName, style: agent?.style };
  const counted = await prisma.conversation.update({ where: { id: conv.id }, data: { messageCount: { increment: 2 }, lastActivityAt: new Date() }, select: { messageCount: true } });
  const depth: SignalType[] = [...(counted.messageCount >= 6 ? (["chat_engaged"] as const) : []), ...(counted.messageCount >= 14 ? (["chat_deep"] as const) : [])];
  if (depth.length) await recordSignal(conv.id, ...depth);
  const ctx: ToolContext = {
    conversationId: conv.id, language: input.language, contactConsent: input.contactConsent,
    channel: input.mode === "voice" ? "VOICE_ASSISTANT" : "TEXT_ASSISTANT",
  };
  if (privacy.storeTranscripts) await prisma.messageEvent.create({ data: { conversationId: conv.id, role: "user", content: input.message } });

  const provider = chatProvider();
  let reply: Reply;
  if (looksUrgent(input.message)) {
    const clinic = await getSetting("clinic_info");
    await executeTool("handoffToStaff", { reason: "emergency" }, ctx);
    const contact = clinic.isPlaceholder ? "" : ` ${input.language === "tr" ? "Klinik" : "Clinic"}: ${clinic.phone}.`;
    reply = {
      mode: provider ? "live" : "mock", handoff: true, cards: [], suggestions: [],
      reply: (input.language === "tr" ? "Bu acil olabilir. Ben bir yapay zekâ asistanıyım ve tıbbi değerlendirme yapamam. " : "This may be urgent. I'm an AI assistant and can't assess medical problems. ") + clinic.emergencyText + contact,
    };
  } else if (provider) {
    await assertWithinBudget();
    try {
      reply = await liveReply(input, ctx, persona, provider);
    } catch (err) {
      // Provider down, out of credit or rejecting the key: keep selling with the scripted flow
      // (same tools, same data) instead of showing the visitor an error. Logged without content.
      const status = (err as { status?: number }).status;
      console.warn(`[assistant] ${provider.name} unavailable (${status ?? (err as Error).name}); using scripted flow`);
      reply = await mockReply(input, ctx, persona.name);
    }
  } else {
    reply = await mockReply(input, ctx, persona.name);
  }

  if (privacy.storeTranscripts) await prisma.messageEvent.create({ data: { conversationId: conv.id, role: "assistant", content: reply.reply } });
  return {
    conversationToken: conv.publicToken,
    ...reply,
    agent: agent ? publicAgent(agent) : null,
    speech: input.mode === "voice" ? speechTicket(reply.reply, input.language, agent?.voice) : undefined,
  };
}

async function liveReply(input: Input, ctx: ToolContext, persona: Persona, provider: ChatProvider): Promise<Reply> {
  const { client, model } = provider;
  const tools = (Object.keys(TOOL_SCHEMAS) as ToolName[]).map((n) => ({
    type: "function" as const,
    function: { name: n, description: TOOL_DESCRIPTIONS[n], parameters: zodToJsonSchema(TOOL_SCHEMAS[n]) },
  }));
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(persona, input.language, ctx.contactConsent, input.mode === "voice") },
    ...input.history.map((h) => ({ role: h.role, content: h.text }) as const),
    { role: "user", content: input.message },
  ];
  let handoff = false;
  let reference: string | undefined;
  const cards: AssistantCard[] = [];
  for (let round = 0; round < 5; round++) {
    const res = await client.chat.completions.create({ model, messages, tools, temperature: 0.4, max_tokens: input.mode === "voice" ? 160 : 450 });
    await recordTextUsage(res, ctx.conversationId, model, provider.name);
    const msg = res.choices[0]?.message;
    if (!msg) break;
    if (!msg.tool_calls?.length) {
      return { mode: "live", handoff, reference, cards, suggestions: suggestionsFor(input.language, cards, Boolean(reference)), reply: msg.content?.trim() || fallbackText(input.language) };
    }
    messages.push(msg);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await executeTool(call.function.name, args, ctx);
      if (call.function.name === "handoffToStaff" && result.ok) handoff = true;
      if (typeof result.reference === "string") reference = result.reference;
      const card = await cardFor(call.function.name, args, result, input.language);
      if (card && !cards.some((c) => c.type === card.type)) cards.push(card);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { mode: "live", handoff, reference, cards, suggestions: [], reply: fallbackText(input.language) };
}

function fallbackText(lang: "en" | "tr") {
  return lang === "tr"
    ? "Bunu şu anda yanıtlayamıyorum. Talebinizi iletişim formundan gönderebilir veya kliniği arayabilirsiniz."
    : "I can't answer that right now. You can send a request using the contact form or call the clinic.";
}

// ───────────────────────────── Development sales flow (no API key) ─────────────────────────────

const MARKETS: [RegExp, string, string][] = [
  [/\b(uk|u\.k\.|england|britain|british|london|scotland|wales|ingiltere|birleşik krallık)\b/i, "GB", "the UK"],
  [/\b(us|u\.s\.|usa|america|american|states|amerika|abd)\b/i, "US", "the US"],
  [/\b(germany|german|deutschland|almanya)\b/i, "DE", "Germany"],
  [/\b(netherlands|dutch|holland|hollanda)\b/i, "NL", "the Netherlands"],
  [/\b(ireland|irish|irlanda)\b/i, "IE", "Ireland"],
];
const TREATMENT_WORDS: [RegExp, string][] = [
  [/implant/i, "implants"],
  [/veneer|lamina|kaplama|hollywood smile/i, "veneers"],
  [/whiten|beyazlat/i, "whitening"],
  [/align|brace|ortho|şeffaf plak|tel/i, "orthodontics"],
  [/clean|hygiene|temizl/i, "hygiene"],
  [/consult|check.?up|exam|muayene|kontrol/i, "consultation"],
];

function detect<T>(texts: string[], table: [RegExp, ...T[]][]): T[] | null {
  for (const t of [...texts].reverse()) for (const [re, ...rest] of table) if (re.test(t)) return rest as T[];
  return null;
}

const NAME_WORD = "[A-ZÇĞİÖŞÜa-zçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü'-]+";
/** Words that follow "I'm" in sentences that are not introductions ("I'm interested in…"). */
const NOT_A_NAME = /^(interested|looking|from|in|based|thinking|not|here|calling|asking|living|travelling|traveling|coming|planning|a|an|the|very|so|just|still|also|ok|okay|fine|good|happy|ready|curious|scared|nervous|worried)$/i;

function extractContact(texts: string[]) {
  const recentFirst = [...texts].reverse();
  const all = recentFirst.join("\n");
  const email = all.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i)?.[0];
  const phone = all.match(/\+?\d[\d\s()-]{7,}\d/)?.[0]?.replace(/[^\d+]/g, "");
  let name: string | undefined;
  for (const t of recentFirst) {
    // Explicit introductions win over "I'm …".
    const explicit = t.match(new RegExp(`(?:my name is|name's|adım|ismim)\\s+(${NAME_WORD}(?:\\s+${NAME_WORD})?)`, "i"))?.[1];
    if (explicit) {
      name = explicit;
      break;
    }
    const loose = t.match(new RegExp(`(?:^|[.!,]\\s*)(?:i am|i'm|this is|ben)\\s+(${NAME_WORD}(?:\\s+${NAME_WORD})?)`, "i"))?.[1];
    if (loose && !NOT_A_NAME.test(loose.split(/\s+/)[0])) {
      name = loose.split(/\s+/).filter((w) => !NOT_A_NAME.test(w)).join(" ");
      break;
    }
  }
  return { email, phone, name: name?.replace(/[,.]$/, "") };
}

/** Pick one phrasing per turn so the scripted fallback doesn't repeat itself word for word. */
function vary(seed: string, options: string[]) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

async function mockReply(input: Input, ctx: ToolContext, name: string): Promise<Reply> {
  const tr = input.language === "tr";
  const m = input.message.toLowerCase();
  const seed = `${name}:${input.history.length}:${m}`;
  const say = (en: string[], trs: string[]) => vary(seed, tr ? trs : en);
  const userTexts = [...input.history.filter((h) => h.role === "user").map((h) => h.text), input.message];
  const market = detect<string>(userTexts, MARKETS as never);
  const treatment = detect<string>(userTexts, TREATMENT_WORDS as never)?.[0];
  const voice = input.mode === "voice";
  const cards: AssistantCard[] = [];
  const out = (reply: string, extra: Partial<Reply> = {}): Reply => ({
    mode: "mock", handoff: false, cards, reply, suggestions: suggestionsFor(input.language, cards, Boolean(extra.reference)), ...extra,
  });
  const run = async (tool: string, args: Record<string, unknown>) => {
    const r = await executeTool(tool, args, ctx);
    const card = await cardFor(tool, args, r, input.language);
    if (card) cards.push(card);
    return r;
  };

  // Honest identity: never claim to be human.
  if (/(real person|are you (a )?(human|person|real|bot|robot|ai)|is this (a )?(bot|human|real)|chat ?bot|gerçek (bir )?(insan|kişi)|robot mu|bot mu|yapay zek)/i.test(m)) {
    return out(tr
      ? `Dürüst olayım: ben ${name}, Dent Flex'in yapay zekâ bakım koordinatörüyüm. Tedaviler, fiyatlar ve muayene talebi konusunda yardımcı olabilirim — isterseniz sizi hemen ekibimizden bir kişiye de bağlarım.`
      : `Honest answer: I'm ${name}, one of Dent Flex's AI care coordinators. I can help with treatments, prices and your consultation request — and I'm happy to bring in a human colleague any time.`);
  }

  // Close: the visitor wants to book / gave details.
  const wantsBooking = /(book|appointment|consult|request|yes please|let'?s do|sign me|randevu|muayene talep|evet)/i.test(m);
  const contact = extractContact(userTexts);
  if (wantsBooking || contact.email || contact.phone) {
    if (!contact.name || !(contact.email || contact.phone)) {
      return out(say(
        ["Lovely, let's get that sorted. What's your name, and the best number or email for the team?", "Perfect. I just need your name and a phone number or email, then I'll pass it straight over.", "Great, happy to set that up for you. Who am I speaking with, and what's the best way to reach you?"],
        ["Harika, hemen halledelim. Adınızı ve size ulaşabileceğimiz telefon ya da e-postayı yazar mısınız?", "Süper. Adınızı ve bir telefon numarası ya da e-posta alayım, hemen ekibe iletiyorum.", "Memnuniyetle. Kiminle görüşüyorum, size nasıl ulaşalım?"],
      ));
    }
    if (!ctx.contactConsent) {
      return out(tr
        ? `Teşekkürler ${contact.name}! Göndermeden önce, sohbetin altındaki onay kutusunu işaretler misiniz? Böylece ekibimiz sizinle iletişime geçebilir.`
        : `Thank you, ${contact.name}! Before I send it, please tick the consent box under the chat so our team may contact you.`);
    }
    const r = await run("createAppointmentRequest", { fullName: contact.name, email: contact.email, phone: contact.phone, treatmentSlug: treatment });
    if (r.ok) {
      return out(tr
        ? `Tamamdır, ${contact.name}! Talebiniz iletildi (referans ${r.reference}). Bu henüz kesin randevu değil; ekibimiz sizi arayıp size uygun bir saat ayarlayacak.`
        : `Done, ${contact.name}! Your request is in (reference ${r.reference}). This is not a confirmed booking yet — our team will call you to find a time that suits you.`, { reference: String(r.reference) });
    }
    return out(tr ? "Bilgilerde bir sorun var gibi görünüyor. Telefon numaranızı ülke koduyla birlikte yazabilir misiniz?" : "Something in those details didn't look right. Could you share your phone with the country code, or an email address?");
  }

  // Price / savings / comparison.
  if (/(price|cost|how much|cheap|save|saving|compare|expensive|fiyat|ücret|ne kadar|ucuz|karşılaştır|tasarruf)/i.test(m) || (market && /(from|live|here|yaşıyorum|geliyorum)/i.test(m))) {
    const r = (await run("getPriceComparison", { treatment, market: market?.[0] })) as { comparisons: { treatment: string; market: string; ourPrice: string; typicalThere: string; savings: string | null; source: string }[] };
    if (r.comparisons.length) {
      const c = r.comparisons[0];
      return out(voice
        ? (tr ? `${c.treatment} için ${c.market} ortalaması ${c.typicalThere}, bizde ${c.ourPrice}. Size özel net plan için ücretsiz bir muayene talebi hazırlayayım mı?` : `${c.treatment} typically costs ${c.typicalThere} in ${c.market}, and with us it's ${c.ourPrice}${c.savings ? `, a saving of ${c.savings}` : ""}. Shall I set up a consultation request so you get an exact plan?`)
        : (tr ? `${c.market} tarafında ${c.treatment} genelde ${c.typicalThere} civarında, bizde ${c.ourPrice}. (Kaynak: ${c.source}) Kesin rakam muayeneden sonra netleşir. Size özel planı çıkarmamız için bir muayene talebi açayım mı?` : `${vary(seed, ["So here's how it looks.", "Okay, real numbers for you.", "Here's the honest comparison."])} ${c.treatment} in ${c.market} usually runs ${c.typicalThere}; with us it's ${c.ourPrice}${c.savings ? `, so roughly ${c.savings} less` : ""}. (Source: ${c.source}) Your exact price comes after an exam. Want me to request a consultation so the team can put your plan together?`));
    }
    await run("getPublishedTreatmentPrices", {});
    if (!market) {
      return out(say(
        ["Happy to show you real numbers. Where are you based at the moment?", "Sure. Just so I compare like with like, where are you based?", "Good question. Where are you based, so I can line it up against prices back home?"],
        ["Memnuniyetle gerçek rakamları göstereyim. Şu an nerede yaşıyorsunuz?", "Tabii. Doğru karşılaştırma için soruyorum: nerede yaşıyorsunuz?"],
      ));
    }
    return out(tr
      ? "Bu tedavi için henüz kaynaklı bir karşılaştırma yayımlamadık ve tahmin vermek istemem. Ekibimiz size kesin bir fiyat teklifi hazırlayabilir — muayene talebi oluşturayım mı?"
      : "We haven't published a sourced comparison for that yet, and I won't guess numbers. Our team can prepare an exact quote for you — shall I request a consultation?");
  }

  if (/(why|choose|trust|safe|quality|better|different|neden|güven|kalite|fark)/i.test(m)) {
    const r = (await run("getWhyChooseUs", {})) as { reasons: { title: string }[] };
    return out(tr
      ? `Hastalarımızın en çok söylediği: ${r.reasons.slice(0, 3).map((x) => x.title.toLowerCase()).join(", ")}. Siz hangi tedaviyi düşünüyorsunuz?`
      : `${vary(seed, ["Honestly, what patients mention most is", "Fair question. People usually tell us it's", "What people tend to like is"])} ${r.reasons.slice(0, 3).map((x) => x.title.toLowerCase()).join(", ")}. Which treatment are you thinking about?`);
  }

  if (/(treatment|offer|service|do you do|tedavi|hizmet)/i.test(m)) {
    await run("getPublishedTreatmentPrices", {});
    return out(say(
      ["Here's what we do. Which one's on your mind?", "These are our treatments. Anything catching your eye?"],
      ["Tedavilerimiz şunlar. Aklınızdaki hangisi?", "Sunduklarımız aşağıda. Hangisi ilginizi çekti?"],
    ));
  }

  if (treatment) {
    return out(say(
      ["Ah nice, we get asked about that a lot. Where are you based? I'll show you how it compares with home.", "Good one. Where are you based right now, so I can compare it with prices there?", "Got it. Where are you based? I'll pull up a proper comparison for you."],
      ["Güzel, bunu çok soruyorlar. Nerede yaşıyorsunuz? Oradaki fiyatlarla karşılaştırayım.", "Anladım. Şu an nerede yaşıyorsunuz? Size gerçek bir karşılaştırma göstereyim."],
    ));
  }

  if (/(human|person|staff|someone|insan|biriyle|yetkili)/i.test(m)) {
    await executeTool("handoffToStaff", { reason: "visitor_request" }, ctx);
    return out(tr ? "Tabii, sizi ekipten bir arkadaşa bağlıyorum. Adınızı ve telefonunuzu bırakırsanız size dönsünler." : "Of course, I'll get a colleague on it. Leave your name and phone or email and they'll get back to you.", { handoff: true });
  }

  if (/^(hi|hello|hey|good (morning|afternoon|evening)|merhaba|selam|iyi günler)\b/i.test(m) || input.history.length === 0) {
    const faq = (await executeTool("searchClinicFAQ", { query: input.message }, ctx)) as { results: { answer: string }[] };
    if (faq.results.length) return out(faq.results[0].answer);
    return out(say(
      [`Hi, I'm ${name} from the Dent Flex patient team. What can I help you with today?`, `Hey! ${name} here from Dent Flex. What are you thinking of getting done?`, `Hi there, I'm ${name} from the Dent Flex patient team 😊 What brings you in today?`],
      [`Merhaba, ben ${name}, Dent Flex hasta ekibinden. Size nasıl yardımcı olabilirim?`, `Merhaba! Dent Flex'ten ${name}. Ne yaptırmayı düşünüyorsunuz?`],
    ));
  }

  const faq = (await executeTool("searchClinicFAQ", { query: input.message }, ctx)) as { results: { answer: string }[] };
  if (faq.results.length) return out(faq.results[0].answer);
  return out(tr
    ? "Bundan emin değilim, yanlış bilgi vermek istemem. Ekibe sorayım mı, yoksa tedaviler ve fiyatlarla mı devam edelim?"
    : "I'm not sure on that one and I'd rather not guess. Want me to check with the team, or shall we look at treatments and prices?");
}

export function assertAssistantAvailable() {
  if (process.env.ASSISTANT_DISABLED === "true") throw new ApiError("UNAVAILABLE", "The assistant is unavailable. Please use the contact form.");
}
