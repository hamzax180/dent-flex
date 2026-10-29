"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";
export type SpeechTicket = { text: string; lang: Lang; voice: string; sig: string };
export type VoiceReply = { text: string; speech?: SpeechTicket };

// Minimal typings for the Web Speech API (not in lib.dom for all TS targets).
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

const FEMALE_HINTS = /female|woman|samantha|victoria|karen|moira|tessa|serena|zira|aria|jenny|libby|sonia|emel|yelda|seda|filiz|google uk english female|google türkçe/i;

function speakable(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hands-free voice conversation.
 * Listening uses the browser's speech recognition. Speaking uses the clinic's natural voice
 * (server-side OpenAI TTS via signed tickets) and falls back to the browser's built-in voice.
 * Loop: greet → listen → onUtterance (server) → speak reply → listen again. Stops after repeated
 * silence, on error, or stop(). Audio is never recorded or stored by us.
 */
export function useVoice({ lang, onUtterance, getToken }: { lang: Lang; onUtterance: (text: string) => Promise<VoiceReply>; getToken?: () => string | null }) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const silenceRef = useRef(0);
  const utterRef = useRef(onUtterance);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const tr = lang === "tr";
  const locale = tr ? "tr-TR" : "en-GB";

  useEffect(() => {
    utterRef.current = onUtterance;
  }, [onUtterance]);

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    setSupported(Boolean(W.SpeechRecognition || W.webkitSpeechRecognition));
    if (!("speechSynthesis" in window)) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(tr ? "tr" : "en"));
      const preferred = tr ? voices : [...voices.filter((v) => /en-GB/i.test(v.lang)), ...voices];
      voiceRef.current = preferred.find((v) => FEMALE_HINTS.test(v.name)) ?? preferred[0] ?? null;
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, [tr]);

  /** Browser voice fallback. */
  const speakBrowser = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!("speechSynthesis" in window)) return resolve();
        const synth = window.speechSynthesis;
        synth.cancel();
        const clean = speakable(text);
        if (!clean || !activeRef.current) return resolve();
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = locale;
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = 1.02;
        u.pitch = 1.05;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        synth.speak(u);
      }),
    [locale],
  );

  /** Natural voice: fetch MP3 for a signed ticket (or the greeting) and play it. */
  const playNatural = useCallback(async (body: object): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;
    try {
      const res = await fetch("/api/assistant/speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !activeRef.current) return false;
      const blob = await res.blob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      audio.src = urlRef.current;
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("playback"));
        audio.play().catch(reject);
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const speak = useCallback(
    async (text: string, ticketOrGreeting?: SpeechTicket | "greeting") => {
      if (!activeRef.current) return;
      setState("speaking");
      const body = ticketOrGreeting === "greeting" ? { greeting: true, lang, conversationToken: getToken?.() ?? undefined } : ticketOrGreeting;
      const ok = body ? await playNatural(body) : false;
      if (!ok && activeRef.current) await speakBrowser(text);
    },
    [lang, playNatural, speakBrowser, getToken],
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setState("idle");
    setInterim("");
    try {
      recRef.current?.abort();
    } catch {
      /* already stopped */
    }
    recRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    const W = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = locale;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim((finalText + " " + live).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError(tr ? "Mikrofon izni verilmedi. Yazışma ile devam edebilirsiniz." : "Microphone access was blocked. You can keep going in chat.");
        stop();
      } else if (e.error === "network") {
        setError(tr ? "Konuşma hizmetine ulaşılamadı. Lütfen yazışmayı kullanın." : "The speech service couldn't be reached. Please use chat.");
        stop();
      }
    };
    rec.onend = async () => {
      if (!activeRef.current || recRef.current !== rec) return;
      const said = finalText.trim();
      setInterim("");
      if (!said) {
        silenceRef.current += 1;
        if (silenceRef.current >= 3) return stop();
        return listen();
      }
      silenceRef.current = 0;
      setState("thinking");
      const reply = await utterRef.current(said);
      if (!activeRef.current) return;
      await speak(reply.text, reply.speech);
      listen();
    };
    try {
      rec.start();
      setState("listening");
    } catch {
      setError(tr ? "Mikrofon başlatılamadı." : "Couldn't start the microphone.");
      stop();
    }
  }, [locale, speak, stop, tr]);

  /** Must be called from a user gesture (tap) so audio playback is allowed on mobile. */
  const start = useCallback(
    async (opener: string) => {
      setError(null);
      silenceRef.current = 0;
      if (!audioRef.current) audioRef.current = new Audio();
      // Unlock playback inside the gesture (iOS/Safari).
      audioRef.current.muted = true;
      audioRef.current.play().catch(() => undefined);
      audioRef.current.pause();
      audioRef.current.muted = false;
      activeRef.current = true;
      setActive(true);
      await speak(opener, "greeting");
      listen();
    },
    [listen, speak],
  );

  useEffect(
    () => () => {
      stop();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [stop],
  );

  return useMemo(() => ({ supported, active, state, interim, error, start, stop }), [supported, active, state, interim, error, start, stop]);
}
