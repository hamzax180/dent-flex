import { prisma } from "../db";
import { recordSignal } from "../interest";
import { ApiError } from "../errors";
import { getSetting } from "../settings";
import { systemPrompt } from "./assistant";
import { TOOL_DESCRIPTIONS, TOOL_SCHEMAS, type ToolName } from "./tools";
import { zodToJsonSchema } from "./schema";
import { estimateVoiceCostMicroUsd } from "./usage";

/**
 * Phone-style voice calls with OpenAI Realtime (speech-to-speech over WebRTC).
 *
 * Unified interface: the browser sends its SDP offer to OUR server, which forwards it to
 * POST /v1/realtime/calls with the API key and the agent's session config, and returns the SDP
 * answer. The browser never receives any API key (not even an ephemeral one). Tool calls arrive
 * on the WebRTC data channel and are relayed to /api/voice/tool, where the server validates and
 * executes them exactly like text chat.
 */

const REALTIME_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];
/** Map TTS-only voices to the closest realtime voice. */
export function realtimeVoice(v?: string | null) {
  if (v && REALTIME_VOICES.includes(v)) return v;
  return ({ nova: "marin", onyx: "cedar", fable: "ballad" } as Record<string, string>)[v ?? ""] ?? "marin";
}

export function voiceEnabled() {
  return process.env.VOICE_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY);
}

export const maxCallSeconds = () => Number(process.env.VOICE_MAX_SESSION_SECONDS ?? 300);

/** Exchange the browser's SDP offer for OpenAI's answer, configured as the conversation's agent. */
export async function startCall(conversationToken: string, language: "en" | "tr", offerSdp: string) {
  if (!voiceEnabled()) throw new ApiError("UNAVAILABLE", "Calls aren't available right now. Please use chat or the contact form.");
  const conv = await prisma.conversation.findUnique({ where: { publicToken: conversationToken }, include: { agent: true } });
  if (!conv || conv.status === "CLOSED") throw new ApiError("NOT_FOUND", "Conversation not found.");
  if (!conv.agent && (await prisma.aiAgent.count({ where: { active: true } })) > 0) {
    throw new ApiError("CONFLICT", "Please wait until a coordinator is free.");
  }
  const profile = await getSetting("sales_profile");
  const persona = { name: conv.agent?.name ?? profile.assistantName, style: conv.agent?.style };
  const greeting = language === "tr"
    ? `Arama bağlandığında kendinizi kısaca tanıtın: "Merhaba, Dent Flex'ten ${persona.name}! Randevunuzu ayarlayalım mı, yoksa önce fiyatlara mı bakalım?" gibi, sıcak ve doğal. Asıl hedefiniz randevuyu almak.`
    : `When the call connects, greet them briefly and warmly, like "Hi, this is ${persona.name} from Dent Flex! Shall we get your appointment booked, or would you like to hear the prices first?" Your main goal on every call is to get the appointment booked.`;
  const instructions = `${systemPrompt(persona, language, false, true)}
- This is a live phone-style call. Speak naturally with a friendly, upbeat rhythm. Keep turns short and let them talk; if they interrupt, stop and listen.
- The consent checkbox is on their screen: before creating a request, ask them to tick it.
- ${greeting}`;

  const tools = (Object.keys(TOOL_SCHEMAS) as ToolName[]).map((name) => ({
    type: "function",
    name,
    description: TOOL_DESCRIPTIONS[name],
    parameters: zodToJsonSchema(TOOL_SCHEMAS[name]),
  }));
  const session = {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini",
    instructions,
    tools,
    tool_choice: "auto",
    audio: {
      input: { transcription: { model: "gpt-4o-mini-transcribe", language }, turn_detection: { type: "semantic_vad" } },
      output: { voice: realtimeVoice(conv.agent?.voice) },
    },
  };

  const form = new FormData();
  form.set("sdp", offerSdp);
  form.set("session", JSON.stringify(session));
  const res = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.warn(`[voice] realtime call setup failed: ${res.status} ${detail}`);
    throw new ApiError("UNAVAILABLE", "The call couldn't connect. Please try again or use chat.");
  }
  await prisma.conversation.update({ where: { id: conv.id }, data: { channel: "VOICE", lastActivityAt: new Date() } });
  await recordSignal(conv.id, "voice_call");
  return { answerSdp: await res.text(), maxSeconds: maxCallSeconds() };
}

/** Record the call once when it ends (duration is capped server-side). */
export async function endCall(conversationToken: string, seconds: number) {
  const conv = await prisma.conversation.findUnique({ where: { publicToken: conversationToken } });
  if (!conv) return;
  const s = Math.max(0, Math.min(Math.round(seconds), maxCallSeconds() + 30));
  await prisma.$transaction([
    prisma.aiUsageEvent.create({
      data: { kind: "VOICE", provider: "openai-realtime", model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini", conversationId: conv.id, durationSeconds: s, estCostMicroUsd: estimateVoiceCostMicroUsd(s) },
    }),
    prisma.conversation.update({ where: { id: conv.id }, data: { lastActivityAt: new Date(), messageCount: { increment: 1 } } }),
  ]);
  if (s >= 120) await recordSignal(conv.id, "voice_call_long");
}
