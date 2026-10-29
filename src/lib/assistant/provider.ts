import { secret } from "../env";
import OpenAI from "openai";

/**
 * Chat provider for the AI coordinator. DeepSeek exposes an OpenAI-compatible API (including
 * tool calling), so both use the same client with a different base URL. Keys stay server-side.
 * Returns null when nothing is configured → the clearly-labelled development mode is used.
 */
export type ChatProvider = { client: OpenAI; model: string; name: "deepseek" | "openai" };

export function chatProvider(): ChatProvider | null {
  const choice = (process.env.CHAT_PROVIDER ?? (secret("DEEPSEEK_API_KEY") ? "deepseek" : "openai")).toLowerCase();
  if (choice === "deepseek" && secret("DEEPSEEK_API_KEY")) {
    return {
      name: "deepseek",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      client: new OpenAI({ apiKey: secret("DEEPSEEK_API_KEY"), baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com", timeout: 30_000, maxRetries: 1 }),
    };
  }
  if (choice === "openai" && secret("OPENAI_API_KEY")) {
    return {
      name: "openai",
      model: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
      client: new OpenAI({ apiKey: secret("OPENAI_API_KEY"), timeout: 30_000, maxRetries: 1 }),
    };
  }
  return null;
}

/** Text-to-speech is only available with an OpenAI key. */
export function ttsAvailable() {
  return Boolean(secret("OPENAI_API_KEY"));
}
