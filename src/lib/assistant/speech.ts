import OpenAI from "openai";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { sign, verifySignature } from "../ids";
import { getSetting } from "../settings";
import { ttsAvailable } from "./provider";

const MAX_CHARS = 700;

/** Text suitable for speaking: no emoji, markdown, URLs; bounded length. */
export function speakable(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

export const TTS_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"] as const;

/**
 * A signed speech ticket for a reply the server itself produced, bound to the agent's voice.
 * The TTS endpoint only voices signed text, so the OpenAI key can't be used as an open proxy.
 */
export function speechTicket(text: string, lang: "en" | "tr", voice?: string | null) {
  if (!ttsAvailable()) return undefined;
  const clean = speakable(text);
  if (!clean) return undefined;
  const v = voice && (TTS_VOICES as readonly string[]).includes(voice) ? voice : "default";
  return { text: clean, lang, voice: v, sig: sign(`tts:${lang}:${v}:${clean}`) };
}

export function verifyTicket(t: { text: string; lang: "en" | "tr"; voice: string; sig: string }) {
  return verifySignature(`tts:${t.lang}:${t.voice}:${t.text}`, t.sig);
}

const STYLE: Record<"en" | "tr", string> = {
  en: "Warm, friendly and confident clinic care coordinator. Natural, upbeat pace, smiling tone, clear British-neutral English. Never rushed.",
  tr: "Sıcak, samimi ve kendinden emin bir klinik danışmanı. Doğal, akıcı ve gülümseyen bir ses tonuyla, net Türkçe konuş.",
};

/** Synthesises speech with OpenAI and returns an MP3 stream. Usage is metered as an estimate. */
export async function synthesize(text: string, lang: "en" | "tr", conversationId?: string | null, voiceOverride?: string) {
  if (!ttsAvailable()) throw new ApiError("UNAVAILABLE", "Natural voice is not configured.");
  const profile = await getSetting("sales_profile");
  const voice = voiceOverride && voiceOverride !== "default" ? voiceOverride : profile.voiceGender === "male" ? process.env.OPENAI_TTS_VOICE_MALE || "onyx" : process.env.OPENAI_TTS_VOICE_FEMALE || "shimmer";
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
  const res = await client.audio.speech.create({
    model,
    voice,
    input: text,
    response_format: "mp3",
    ...(model.includes("gpt-4o") ? { instructions: STYLE[lang] } : {}),
  });
  const perMillion = Number(process.env.AI_TTS_USD_PER_1M_CHARS ?? 0);
  await prisma.aiUsageEvent.create({
    data: { kind: "VOICE", provider: "openai-tts", model, conversationId: conversationId ?? null, inputTokens: text.length, estCostMicroUsd: Math.round(text.length * perMillion) },
  });
  return res.body as ReadableStream<Uint8Array>;
}
