"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import type { AssistantCard } from "@/lib/assistant/assistant";

export type CallState = "idle" | "ringing" | "connected" | "ended" | "failed";
export type Caption = { who: "agent" | "you"; text: string; at: number };

/** A soft two-tone ringback, generated (no audio files). */
function ring(ctx: AudioContext, seconds: number) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  for (const f of [440, 480]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(gain);
    o.start();
    o.stop(ctx.currentTime + seconds);
  }
  const t = ctx.currentTime;
  for (let s = 0; s < seconds; s += 2.6) {
    gain.gain.setValueAtTime(0.0001, t + s);
    gain.gain.linearRampToValueAtTime(0.06, t + s + 0.05);
    gain.gain.setValueAtTime(0.06, t + s + 1.1);
    gain.gain.linearRampToValueAtTime(0.0001, t + s + 1.2);
  }
}

/**
 * Phone-style call with OpenAI Realtime over WebRTC. The SDP exchange goes through our server
 * (/api/voice/session), so no API key ever reaches the browser. Tool calls from the model are
 * relayed to /api/voice/tool for server-side validation, then the result is sent back.
 */
export function useCall({ lang, getToken, getConsent, onCard }: { lang: Lang; getToken: () => string | null; getConsent: () => boolean; onCard?: (c: AssistantCard) => void }) {
  const [state, setState] = useState<CallState>("idle");
  const [speaking, setSpeaking] = useState<"agent" | "you" | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [captions, setCaptions] = useState<Caption[]>([]);
  /** The agent's sentence as it is being spoken (streamed transcript). */
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const startedAt = useRef(0);
  const maxSeconds = useRef(300);
  const timer = useRef(0);
  const tr = lang === "tr";

  const push = useCallback((c: Omit<Caption, "at">) => {
    const at = startedAt.current ? Math.floor((Date.now() - startedAt.current) / 1000) : 0;
    setCaptions((all) => [...all.slice(-30), { ...c, at }]);
  }, []);

  const teardown = useCallback(() => {
    window.clearInterval(timer.current);
    dc.current?.close();
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    if (audio.current) audio.current.srcObject = null;
    pc.current = null;
    dc.current = null;
    mic.current = null;
    setSpeaking(null);
    setPartial("");
  }, []);

  const hangUp = useCallback(() => {
    const token = getToken();
    const secs = startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0;
    teardown();
    setState((s) => (s === "idle" ? s : "ended"));
    if (token && startedAt.current) {
      void fetch("/api/voice/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "end", conversationToken: token, seconds: secs }), keepalive: true }).catch(() => undefined);
    }
    startedAt.current = 0;
  }, [getToken, teardown]);

  const send = (event: object) => dc.current?.readyState === "open" && dc.current.send(JSON.stringify(event));

  const onEvent = useCallback(
    async (raw: string) => {
      let e: { type: string; [k: string]: unknown };
      try {
        e = JSON.parse(raw);
      } catch {
        return;
      }
      switch (e.type) {
        case "output_audio_buffer.started":
          setSpeaking("agent");
          break;
        case "output_audio_buffer.stopped":
        case "output_audio_buffer.cleared":
          setSpeaking(null);
          break;
        case "input_audio_buffer.speech_started":
          setSpeaking("you");
          break;
        case "input_audio_buffer.speech_stopped":
          setSpeaking(null);
          break;
        case "conversation.item.input_audio_transcription.completed":
          if (typeof e.transcript === "string" && e.transcript.trim()) push({ who: "you", text: e.transcript.trim() });
          break;
        case "response.output_audio_transcript.delta":
          if (typeof e.delta === "string") setPartial((p) => p + e.delta);
          break;
        case "response.output_audio_transcript.done":
          setPartial("");
          if (typeof e.transcript === "string" && e.transcript.trim()) push({ who: "agent", text: e.transcript.trim() });
          break;
        case "response.function_call_arguments.done": {
          const token = getToken();
          let output: unknown = { error: "unavailable" };
          try {
            const res = await fetch("/api/voice/tool", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ conversationToken: token, name: e.name, arguments: e.arguments, language: lang, contactConsent: getConsent() }),
            });
            const d = await res.json();
            output = res.ok ? d.output : { error: d?.error?.message ?? "failed" };
            if (d.card) onCard?.(d.card);
          } catch {
            /* tell the model it failed; it will offer the form or a human */
          }
          send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: e.call_id, output: JSON.stringify(output) } });
          send({ type: "response.create" });
          break;
        }
        case "error": {
          const err = e.error as { message?: string } | undefined;
          console.warn("[call] realtime error", err?.message);
          break;
        }
      }
    },
    [getConsent, getToken, lang, onCard, push],
  );

  /** Must run from a user gesture (tap) so the microphone prompt and audio playback are allowed. */
  const call = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setError(null);
    setCaptions([]);
    setSeconds(0);
    setMuted(false);
    setState("ringing");
    try {
      const ctx = new AudioContext();
      ring(ctx, 2.4);
      window.setTimeout(() => void ctx.close(), 2600);

      mic.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const peer = new RTCPeerConnection();
      pc.current = peer;
      audio.current ??= new Audio();
      audio.current.autoplay = true;
      peer.ontrack = (ev) => {
        if (audio.current) audio.current.srcObject = ev.streams[0];
      };
      peer.addTrack(mic.current.getTracks()[0], mic.current);
      const channel = peer.createDataChannel("oai-events");
      dc.current = channel;
      channel.onmessage = (m) => void onEvent(m.data);
      channel.onopen = () => {
        startedAt.current = Date.now();
        setState("connected");
        timer.current = window.setInterval(() => {
          const s = Math.floor((Date.now() - startedAt.current) / 1000);
          setSeconds(s);
          if (s >= maxSeconds.current) hangUp();
        }, 500);
        send({ type: "response.create" }); // the agent greets first, like answering a call
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peer.connectionState)) hangUp();
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const [res] = await Promise.all([
        fetch("/api/voice/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "start", conversationToken: token, language: lang, sdp: offer.sdp, termsAccepted: getConsent() }),
        }),
        new Promise((r) => setTimeout(r, 1800)), // let it ring a moment
      ]);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message ?? "call failed");
      maxSeconds.current = d.maxSeconds ?? 300;
      await peer.setRemoteDescription({ type: "answer", sdp: d.answerSdp });
    } catch (err) {
      teardown();
      const name = (err as Error).name;
      setError(
        name === "NotAllowedError"
          ? tr ? "Mikrofon izni verilmedi. Yazışma ile devam edebilirsiniz." : "Microphone access was blocked — you can keep going in chat."
          : (err as Error).message || (tr ? "Arama bağlanamadı." : "The call couldn't connect."),
      );
      setState("failed");
    }
  }, [getConsent, getToken, hangUp, lang, onEvent, teardown, tr]);

  /** Tell the agent about something that happened on screen (e.g. a photo was shared). */
  const notify = useCallback((text: string) => {
    if (dc.current?.readyState !== "open") return;
    dc.current.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } }));
    dc.current.send(JSON.stringify({ type: "response.create" }));
  }, []);

  const toggleMute = useCallback(() => {
    const track = mic.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  useEffect(() => () => teardown(), [teardown]);
  useEffect(() => {
    const onHide = () => state === "connected" && hangUp();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [state, hangUp]);

  return useMemo(
    () => ({ state, speaking, muted, seconds, captions, partial, error, call, hangUp, toggleMute, notify, maxSeconds: maxSeconds.current }),
    [state, speaking, muted, seconds, captions, partial, error, call, hangUp, toggleMute, notify],
  );
}
