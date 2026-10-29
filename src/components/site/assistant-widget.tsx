"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Dict, Lang } from "@/lib/i18n";
import type { AssistantCard } from "@/lib/assistant/assistant";
import { useVoice, type VoiceReply, type VoiceState } from "./use-voice";
import { useCall } from "./use-call";
import { UploadSheet, type SharedFile } from "./upload-sheet";
import type { PublicAgent } from "@/lib/assistant/agents";

type DeliveryStatus = "sent" | "delivered" | "seen";
type Msg = { id: number; role: "user" | "assistant"; text: string; cards?: AssistantCard[]; at: number; status?: DeliveryStatus; attachment?: SharedFile };
let msgSeq = 0;
const nextId = () => ++msgSeq;

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Sent ✓ · Delivered ✓✓ · Seen ✓✓ (green) */
function Ticks({ status }: { status: DeliveryStatus }) {
  const two = status !== "sent";
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden className={`transition-colors duration-500 ${status === "seen" ? "text-[#4fa36b]" : "text-muted/70"}`}>
      <path d="M1 6l3 3 6-7" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {two && <path d="M6 9l1 0 7-8" stroke="currentColor" strokeWidth="1.5" fill="none" />}
    </svg>
  );
}

const money = (minor: number, cur: string, lang: Lang) =>
  new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-GB", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(minor / 100);

/* ───────────────────────────── Visual pieces ───────────────────────────── */

export function Orb({ state = "idle", size = 40, hue, initial }: { state?: VoiceState; size?: number | string; hue?: number; initial?: string }) {
  const px = typeof size === "number" ? `${size}px` : size;
  return (
    <span className={`df-orb df-orb--${state}`} style={{ width: px, height: px }} aria-hidden>
      <span className="df-orb__core" style={hue != null ? { filter: `hue-rotate(${hue - 100}deg) saturate(1.15)` } : undefined} />
      {initial && (
        <span className="absolute inset-0 flex items-center justify-center font-display font-light text-forest/80" style={{ fontSize: `calc(${px} * 0.42)` }}>
          {initial}
        </span>
      )}
      <span className="df-orb__ring" />
      <span className="df-orb__ring df-orb__ring--2" />
    </span>
  );
}

/** Honest label shown next to every agent name. */
export function AiTag({ dark = false }: { dark?: boolean }) {
  return (
    <span
      title="AI care coordinator"
      className={`ml-1.5 inline-block translate-y-[-2px] px-1.5 py-px align-middle font-sans text-[9px] font-semibold tracking-[0.12em] ${dark ? "bg-ivory/15 text-sage" : "bg-forest/10 text-forest"}`}
    >
      AI
    </span>
  );
}

type TeamMember = { name: string; hue: number };

function ComparisonCard({ card, lang }: { card: Extract<AssistantCard, { type: "comparison" }>; lang: Lang }) {
  const tr = lang === "tr";
  return (
    <div className="space-y-3">
      {card.items.map((c) => {
        const ours = c.currency.split("/")[0];
        const theirs = c.currency.split("/").at(-1)!;
        const max = Math.max(c.elsewhere.maxMinor, c.clinic.maxMinor);
        return (
          <div key={`${c.slug}-${c.market}`} className="border border-forest/10 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-forest">{c.treatmentName}</p>
              {c.savings && c.savings.percentMid > 0 && (
                <span className="shrink-0 bg-forest px-2 py-0.5 text-[11px] font-semibold text-sage">
                  {tr ? `~%${c.savings.percentMid} daha az` : `~${c.savings.percentMid}% less`}
                </span>
              )}
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div>
                <div className="flex justify-between text-muted">
                  <dt>{c.marketLabel}</dt>
                  <dd>{money(c.elsewhere.minMinor, theirs, lang)} – {money(c.elsewhere.maxMinor, theirs, lang)}</dd>
                </div>
                <div className="mt-1 h-2 bg-forest/5">
                  <div className="df-bar h-2 bg-forest/25" style={{ marginLeft: `${(c.elsewhere.minMinor / max) * 100}%`, width: `${Math.max(2, ((c.elsewhere.maxMinor - c.elsewhere.minMinor) / max) * 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between font-medium text-forest">
                  <dt>Dent Flex · Istanbul</dt>
                  <dd>{c.clinic.isFrom ? (tr ? "başlangıç " : "from ") : ""}{money(c.clinic.minMinor, ours, lang)}{c.clinic.isFrom ? "" : ` – ${money(c.clinic.maxMinor, ours, lang)}`}</dd>
                </div>
                <div className="mt-1 h-2 bg-forest/5">
                  <div className="df-bar h-2 bg-sage" style={{ marginLeft: `${(c.clinic.minMinor / max) * 100}%`, width: `${Math.max(2, ((c.clinic.maxMinor - c.clinic.minMinor) / max) * 100)}%` }} />
                </div>
              </div>
            </dl>
            {c.savings && c.savings.maxMinor > 0 && (
              <p className="mt-3 text-sm text-forest">
                {tr ? "Olası tasarruf: " : "Potential saving: "}
                <strong>{money(c.savings.minMinor, ours, lang)} – {money(c.savings.maxMinor, ours, lang)}</strong>
              </p>
            )}
            <p className="mt-2 text-[10px] leading-snug text-muted">
              {tr ? "Kaynak" : "Source"}:{" "}
              {c.source.url ? <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="underline">{c.source.name}</a> : c.source.name} · {c.source.checkedAt.slice(0, 10)}.{" "}
              {tr ? "Seyahat dahil değildir. Kesin fiyat muayeneden sonra." : "Travel not included. Final price after examination."}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Cards({ cards, lang }: { cards: AssistantCard[]; lang: Lang }) {
  const tr = lang === "tr";
  return (
    <div className="mt-2 space-y-2">
      {cards.map((card, i) => {
        if (card.type === "comparison") return <ComparisonCard key={i} card={card} lang={lang} />;
        if (card.type === "freePlan")
          return (
            <Link key={i} href={card.url} className="df-rise flex items-center gap-3 bg-forest p-4 text-ivory shadow-sm transition hover:bg-forest-700">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sage text-forest">✦</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{tr ? "Ücretsiz tedavi planınızı alın" : "Get your free treatment plan"}</span>
                <span className="block text-xs text-ivory/65">{tr ? "Röntgen veya fotoğraf gönderin, hekimimiz yazılı plan hazırlasın" : "Send an X-ray or photos, the dentist writes your plan"}</span>
              </span>
              <span aria-hidden>→</span>
            </Link>
          );
        if (card.type === "treatments")
          return (
            <ul key={i} className="divide-y divide-forest/10 border border-forest/10 bg-white text-sm">
              {card.items.map((t) => (
                <li key={t.slug} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/treatments#${t.slug}`} className="text-forest hover:underline">{t.name}</Link>
                  <span className="text-right text-xs text-muted">{t.price ?? (tr ? "Muayene sonrası teklif" : "Quote after consultation")}</span>
                </li>
              ))}
            </ul>
          );
        if (card.type === "reasons")
          return (
            <div key={i} className="border border-forest/10 bg-white p-4">
              <ul className="space-y-3">
                {card.items.map((r) => (
                  <li key={r.title} className="flex gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center bg-sage text-xs text-forest" aria-hidden>✓</span>
                    <span>
                      <span className="font-medium text-forest">{r.title}</span>
                      <span className="block text-xs leading-relaxed text-muted">{r.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {card.included.length > 0 && <p className="mt-3 border-t border-forest/10 pt-3 text-xs text-muted">{tr ? "Dahil: " : "Included: "}{card.included.join(" · ")}</p>}
            </div>
          );
        return (
          <div key={i} className="df-pop flex items-center gap-3 bg-forest p-4 text-ivory">
            <span className="flex size-9 shrink-0 items-center justify-center bg-sage text-lg text-forest" aria-hidden>✓</span>
            <span className="text-sm">
              <span className="block font-medium">{tr ? "Talep gönderildi" : "Request sent"} · {card.reference}</span>
              <span className="text-xs text-ivory/75">{tr ? "Henüz kesin randevu değil — ekibimiz sizi arayacak." : "Not a confirmed booking yet — our team will call you."}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ConsentRow({ consent, setConsent, lang, t, call = false, name = "" }: { consent: boolean; setConsent: (v: boolean) => void; lang: Lang; t: Dict; call?: boolean; name?: string }) {
  const tr = lang === "tr";
  return (
    <label className={`flex items-start gap-2 border-t border-forest/10 px-4 py-2 text-[11px] leading-snug transition-colors ${consent ? "bg-sage/25 text-forest" : call ? "bg-[#fff8ec] text-ink" : "bg-white text-muted"}`}>
      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-forest" />
      <span>
        {call
          ? tr
            ? `Aramak için kabul edin: ${name} yapay zekâ destekli bir danışmandır, görüşme yazıya dökülür ama kaydedilmez ve Dent Flex bana paylaştığım bilgilerle ulaşabilir.`
            : `To call, please agree: ${name} is an AI-powered coordinator, the call is transcribed but never recorded, and Dent Flex may contact me using the details I share.`
          : tr
            ? "Paylaştığım iletişim bilgileriyle Dent Flex'in bana ulaşmasını kabul ediyorum."
            : "I agree Dent Flex may contact me using the details I share here."}{" "}
        <Link href="/privacy" target="_blank" className="underline">{t.footer.privacy}</Link>
      </span>
    </label>
  );
}

/* ───────────────────────────── Widget ───────────────────────────── */

export function AssistantWidget({ t, lang, assistantName, team = [], callsEnabled = false }: { t: Dict; lang: Lang; assistantName: string; team?: TeamMember[]; callsEnabled?: boolean }) {
  const tr = lang === "tr";
  // closed -> opening (panel sits on the button) -> open (glides to centre) -> closing (back to button)
  const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">("closed");
  const open = phase !== "closed";
  const origin = useRef<{ x: number; y: number } | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const reducedRef = useRef(false);
  const [tab, setTab] = useState<"chat" | "voice">("chat");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [mode, setMode] = useState<"live" | "mock" | null>(null);
  // Named agent assignment / fair queue
  const [session, setSession] = useState<"idle" | "joining" | "queued" | "ready">("idle");
  const [agent, setAgent] = useState<PublicAgent | null>(null);
  const [queue, setQueue] = useState<{ position: number; eta: number; online: number } | null>(null);
  const [consent, setConsent] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(
    tr ? ["İngiltere ile fiyat karşılaştır", "Hangi tedaviler var?", "Neden Dent Flex?"] : ["Compare prices with the UK", "Which treatments do you offer?", "Why Dent Flex?"],
  );
  const tokenRef = useRef<string | null>(null);
  const msgsRef = useRef<Msg[]>([]);
  const consentRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);
  useEffect(() => {
    consentRef.current = consent;
  }, [consent]);
  useEffect(() => {
    try {
      tokenRef.current = sessionStorage.getItem("df_conv");
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  const openFrom = useCallback((rect?: DOMRect | null) => {
    origin.current = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    setPhase(reducedRef.current ? "open" : "opening");
  }, []);
  // Two frames on the button, then release: the CSS transition glides it to the centre.
  useEffect(() => {
    if (phase !== "opening") return;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => (id2 = requestAnimationFrame(() => setPhase("open"))));
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [phase]);
  useEffect(() => {
    if (phase === "open" && tab === "chat") {
      const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), reducedRef.current ? 0 : 700);
      return () => window.clearTimeout(id);
    }
  }, [phase, tab]);
  // Lock page scroll behind the panel.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  // Opened from elsewhere on the page (e.g. the mobile bottom bar), launching from that button.
  useEffect(() => {
    const onOpen = (e: Event) => openFrom((e as CustomEvent<{ rect?: DOMRect }>).detail?.rect ?? null);
    window.addEventListener("df:open-assistant", onOpen);
    return () => window.removeEventListener("df:open-assistant", onOpen);
  }, [openFrom]);

  /** Sends a message; resolves with the reply (and its signed speech ticket) so voice mode can speak it. */
  const ask = useCallback(
    async (message: string, via: "text" | "voice", attachment?: SharedFile): Promise<VoiceReply> => {
      const history = msgsRef.current.slice(-10).map((m) => ({ role: m.role, text: m.text.slice(0, 2000) }));
      const id = nextId();
      const instant = via === "voice" || reducedRef.current;
      const setStatus = (status: DeliveryStatus) => setMsgs((all) => all.map((x) => (x.id === id ? { ...x, status } : x)));
      setMsgs((m) => [...m, { id, role: "user", text: message, at: Date.now(), status: "sent", attachment }]);
      setBusy(true);
      const sentAt = performance.now();
      // Delivered almost at once; "seen" after a short, natural reading pause; then typing starts.
      const delivered = window.setTimeout(() => setStatus("delivered"), instant ? 0 : 280 + Math.random() * 220);
      let seenAt = 0;
      const seen = new Promise<void>((resolve) =>
        window.setTimeout(() => {
          setStatus("seen");
          setTyping(true);
          seenAt = performance.now();
          resolve();
        }, instant ? 0 : 750 + Math.random() * 900),
      );
      try {
        const res = await fetch("/api/assistant/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationToken: tokenRef.current, message, language: lang, history, contactConsent: consentRef.current, mode: via }),
        });
        const data = await res.json();
        if (!res.ok && res.status !== 409) throw new Error(data?.error?.message);
        if (data.conversationToken) tokenRef.current = data.conversationToken;
        try {
          sessionStorage.setItem("df_conv", data.conversationToken);
        } catch {
          /* ignore */
        }
        if (res.status === 409) {
          setSession("queued");
          throw new Error(data?.error?.message);
        }
        setMode(data.mode);
        if (data.agent) setAgent(data.agent);
        // Natural rhythm: the reply appears only after "seen", with typing time scaled to its length.
        await seen;
        if (!instant) {
          const want = Math.min(2600, 700 + (data.reply as string).length * 10);
          const typed = performance.now() - Math.max(seenAt, sentAt);
          if (want > typed) await new Promise((r) => setTimeout(r, want - typed));
        }
        setSuggestions(data.suggestions ?? []);
        setTyping(false);
        setMsgs((m) => [...m, { id: nextId(), role: "assistant", text: data.reply, cards: data.cards, at: Date.now() }]);
        return { text: data.reply as string, speech: data.speech };
      } catch (err) {
        const fallback = tr ? "Şu anda yanıt veremiyorum. Lütfen iletişim formunu kullanın veya kliniği arayın." : "I can't answer right now. Please use the contact form or call the clinic.";
        const msg = (err as Error).message || fallback;
        setTyping(false);
        setMsgs((m) => [...m, { id: nextId(), role: "assistant", text: msg, at: Date.now() }]);
        return { text: msg };
      } finally {
        window.clearTimeout(delivered);
        setBusy(false);
      }
    },
    [lang, tr],
  );

  const [sheet, setSheet] = useState(false);
  const voice = useVoice({ lang, onUtterance: (said) => ask(said, "voice"), getToken: () => tokenRef.current });
  // Phone-style call (OpenAI Realtime). Cards the agent quotes during the call land in the chat too.
  const call = useCall({
    lang,
    getToken: () => tokenRef.current,
    getConsent: () => consentRef.current,
    onCard: (card) => setMsgs((m) => [...m, { id: nextId(), role: "assistant", text: tr ? "Görüşmemizden:" : "From our call:", cards: [card], at: Date.now() }]),
  });

  const join = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationToken: tokenRef.current, language: lang }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message);
      tokenRef.current = d.conversationToken;
      try {
        sessionStorage.setItem("df_conv", d.conversationToken);
      } catch {
        /* ignore */
      }
      if (d.status === "queued") {
        setQueue({ position: d.position, eta: d.etaSeconds, online: d.agentsOnline });
        setSession("queued");
      } else {
        setAgent(d.agent ?? null);
        setQueue(null);
        setSession("ready");
      }
    } catch {
      setSession("ready"); // fall back to the assistant without a named agent rather than blocking
    }
  }, [lang]);

  useEffect(() => {
    if (!open) return;
    if (session === "idle") {
      setSession("joining");
      void join();
    }
    if (session !== "queued") return;
    const id = window.setInterval(() => void join(), 3000);
    return () => window.clearInterval(id);
  }, [open, session, join]);

  /** Frees the agent for the next visitor (also on tab close). */
  const endSession = useCallback((beacon = false) => {
    const token = tokenRef.current;
    if (!token) return;
    const body = JSON.stringify({ conversationToken: token, action: "end" });
    if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/assistant/session", body);
    else void fetch("/api/assistant/session", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
    tokenRef.current = null;
    try {
      sessionStorage.removeItem("df_conv");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const onHide = () => endSession(true);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [endSession]);

  const close = useCallback(() => {
    voice.stop();
    call.hangUp();
    endSession();
    setSession("idle");
    setAgent(null);
    setQueue(null);
    setMsgs([]);
    if (reducedRef.current) return setPhase("closed");
    setPhase("closing");
    window.setTimeout(() => setPhase("closed"), 620);
  }, [voice, call, endSession]);
  // Return keyboard focus to the launcher once it is back on the page.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) wasOpen.current = true;
    else if (wasOpen.current) {
      wasOpen.current = false;
      launcherRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  /** Big quick actions on the stage. */
  const quick = tr
    ? [
        { icon: "price", label: "Fiyatları ülkemle karşılaştır", say: "Fiyatları İngiltere ile karşılaştırır mısın?" },
        { icon: "spark", label: "Neden Dent Flex?", say: "Neden Dent Flex'i seçmeliyim?" },
        { icon: "calendar", label: "Randevunuzu alın", say: "Randevu almak istiyorum" },
      ]
    : [
        { icon: "price", label: "Compare prices with home", say: "Compare prices with the UK" },
        { icon: "spark", label: "Why patients choose us", say: "Why should I choose Dent Flex?" },
        { icon: "calendar", label: "Book your appointment", say: "I'd like to book an appointment" },
      ];
  const runQuick = (say: string) => {
    voice.stop();
    setTab("chat");
    void ask(say, "text");
  };
  const startVoice = () => {
    setTab("voice");
    if (callsEnabled) {
      if (consent && call.state !== "ringing" && call.state !== "connected") void call.call();
    } else if (!voice.active) void voice.start(opener);
  };


  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    void ask(message, "text");
  };

  const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const name = agent?.name ?? assistantName;
  const greeting = tr
    ? `Merhaba, ben ${name} 👋 Dent Flex'ten. Randevunuzu ayarlayalım mı, yoksa önce fiyatları mı karşılaştıralım?`
    : `Hi, I'm ${name} 👋 from Dent Flex. Shall we book your appointment, or would you like to see how our prices compare with home first?`;
  const opener = tr ? `Merhaba, ben ${name}. Gülüşünüzde neyi değiştirmek istersiniz?` : `Hi, I'm ${name}. What would you love to change about your smile?`;
  const ready = session === "ready";

  const atRest = phase === "open";
  const o = origin.current;
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;
  // From the launcher's centre (or the bottom-right corner) to the screen centre.
  const fromX = (o?.x ?? vw - 80) - vw / 2;
  const fromY = (o?.y ?? vh - 60) - vh / 2;
  const panelMotion: React.CSSProperties = reducedRef.current
    ? {}
    : {
        transform: atRest ? "translate3d(0,0,0) scale(1)" : `translate3d(${fromX}px, ${fromY}px, 0) scale(0.06)`,
        opacity: atRest ? 1 : 0,
        transition:
          phase === "closing"
            ? "transform 600ms cubic-bezier(.6,0,.8,.3), opacity 500ms ease 100ms"
            : "transform 900ms cubic-bezier(.16,1,.3,1), opacity 450ms ease",
      };
  const delay = (ms: number) => ({ animationDelay: `${reducedRef.current ? 0 : ms}ms` });
  const callOrb: VoiceState = call.speaking === "agent" ? "speaking" : call.speaking === "you" ? "listening" : call.state === "ringing" ? "thinking" : "idle";
  const orbState: VoiceState = busy ? "thinking" : tab === "voice" ? (callsEnabled ? callOrb : voice.state) : "idle";

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={(e) => openFrom(e.currentTarget.getBoundingClientRect())}
          aria-haspopup="dialog"
          className="df-launcher fixed bottom-6 right-6 z-40 hidden items-center gap-3 bg-forest py-2 pl-2 pr-5 text-left text-ivory shadow-[0_12px_40px_rgba(31,51,41,0.35)] transition hover:-translate-y-0.5 sm:flex"
        >
          <span className="flex -space-x-3">
            {(team.length ? team.slice(0, 3) : [{ name: assistantName, hue: 100 }]).map((m) => (
              <span key={m.name} className="rounded-full ring-2 ring-forest"><Orb size={34} hue={m.hue} initial={m.name[0]} /></span>
            ))}
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-medium">{tr ? "Bakım ekibimizle konuşun" : "Talk to our care team"}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-sage">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#9be29b]" aria-hidden />
              {team.length ? (tr ? `${team.length} koordinatör çevrimiçi` : `${team.length} coordinators online`) : (tr ? "Fiyatlar · tedaviler · sesli" : "Prices · treatments · voice")}
            </span>
          </span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-6">
          {/* Backdrop: the page dims and blurs behind the panel */}
          <div
            aria-hidden
            onClick={close}
            className="absolute inset-0 bg-[rgba(9,18,13,0.62)] backdrop-blur-md transition-opacity duration-700"
            style={{ opacity: atRest ? 1 : 0 }}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${name} — ${t.assistant.title}`}
            style={panelMotion}
            className="relative grid h-full w-full origin-center overflow-hidden bg-ivory shadow-[0_40px_120px_rgba(5,12,9,0.55)] will-change-transform sm:h-[min(780px,92dvh)] sm:w-[min(1120px,96vw)] sm:rounded-[28px] md:grid-cols-[minmax(320px,400px)_1fr] lg:grid-cols-[440px_1fr]"
          >
            {/* Stage (tablet/desktop) */}
            <aside className="df-stage relative hidden min-h-0 flex-col overflow-y-auto overflow-x-hidden bg-forest px-8 py-[clamp(1rem,3dvh,1.75rem)] text-ivory [scrollbar-width:none] md:flex lg:px-10">
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"><div className="df-aurora" /></div>
              <p className="df-rise eyebrow relative text-[0.7rem] text-sage [@media(max-height:560px)]:hidden" style={delay(380)}>
                Dent Flex · {tr ? "Hasta ekibi" : "Patient team"}
              </p>

              <button
                type="button"
                onClick={startVoice}
                className="df-rise relative mx-auto mt-[clamp(0.5rem,2dvh,1.25rem)] shrink-0 rounded-full"
                style={delay(460)}
                aria-label={tr ? "Sesli görüşmeyi başlat" : "Start a voice conversation"}
              >
                <Orb size="clamp(56px, 16dvh, 150px)" state={orbState} hue={agent?.hue} initial={agent ? agent.name[0] : undefined} />
              </button>

              <div className="df-rise relative mt-[clamp(0.5rem,2dvh,1.25rem)] text-center" style={delay(560)}>
                <h2 className="display text-[clamp(2rem,6dvh,3rem)] leading-none">{ready ? name : (tr ? "Ekibimiz" : "Our team")}</h2>
                {ready && agent && (
                  <p className="mt-2 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.16em] text-sage">
                    {agent.tagline}
                    <span className="flex items-center gap-1 normal-case tracking-normal text-ivory/70"><span className="inline-block size-1.5 rounded-full bg-[#7fd28f]" aria-hidden />{tr ? "Şu an aktif" : "Active now"}</span>
                  </p>
                )}
                <p className="mt-3 text-sm text-ivory/75 [@media(max-height:760px)]:hidden">
                  {tr ? "Fiyatınızı görün, karşılaştırın ve randevunuzu hemen alın." : "See your price, compare it with home, and book your appointment today."}
                </p>
              </div>

              <ul className="relative mt-[clamp(0.75rem,3dvh,1.5rem)] space-y-[clamp(0.3rem,1dvh,0.5rem)]">
                {quick.map((q, i) => (
                  <li key={q.label} className="df-rise" style={delay(660 + i * 90)}>
                    <button
                      type="button"
                      onClick={() => runQuick(q.say)}
                      disabled={busy}
                      className="group flex w-full items-center gap-3 border border-ivory/15 bg-ivory/[0.06] px-4 py-[clamp(0.4rem,1.4dvh,0.75rem)] text-left text-sm backdrop-blur transition hover:-translate-y-px hover:border-sage/60 hover:bg-ivory/[0.12] disabled:opacity-50"
                    >
                      <QuickIcon name={q.icon} />
                      <span className="flex-1">{q.label}</span>
                      <span className="text-sage transition group-hover:translate-x-1" aria-hidden>→</span>
                    </button>
                  </li>
                ))}
                <li className="df-rise" style={delay(930)}>
                  <button
                    type="button"
                    onClick={startVoice}
                    className="group flex w-full items-center gap-3 bg-sage px-4 py-[clamp(0.4rem,1.4dvh,0.75rem)] text-left text-sm font-medium text-forest transition hover:bg-[#cdd3b6]"
                  >
                    <QuickIcon name="mic" dark />
                    <span className="flex-1">{callsEnabled ? (tr ? `${name} ile telefonda görüşün` : `Call ${name}`) : (tr ? "Sesli konuşun" : "Talk by voice")}</span>
                    <span aria-hidden className="transition group-hover:translate-x-1">→</span>
                  </button>
                </li>
              </ul>

              <div className="relative mt-auto pt-[clamp(0.25rem,2dvh,1rem)] text-[10px] leading-snug text-ivory/55">
                {mode === "mock" && <p className="mb-2 inline-block bg-gold/25 px-2 py-0.5 text-ivory/80">Demo mode — scripted flow using your published data</p>}
                <Link href="/contact#request" onClick={close} className="mt-2 inline-block text-sage underline-offset-2 hover:underline">{t.assistant.human} →</Link>
              </div>
            </aside>

            {/* Conversation */}
            <div className="flex min-h-0 flex-col">
              <header className="relative flex items-center gap-3 border-b border-forest/10 bg-ivory px-4 py-3 sm:px-6">
                <span className="md:hidden"><Orb size={38} state={orbState} hue={agent?.hue} initial={agent ? agent.name[0] : undefined} /></span>
                <div className="min-w-0 flex-1 md:hidden">
                  <p className="display text-lg leading-none text-forest">{name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted"><span className="inline-block size-1.5 rounded-full bg-[#4fa36b]" aria-hidden />{typing ? (tr ? "yazıyor…" : "typing…") : (tr ? "Şu an aktif" : "Active now")}</p>
                </div>
                <div role="tablist" aria-label="Mode" className="grid grid-cols-2 bg-forest/[0.06] p-1 text-xs font-medium md:w-64">
                  {(["chat", "voice"] as const).map((k) => (
                    <button
                      key={k}
                      role="tab"
                      aria-selected={tab === k}
                      onClick={() => { if (k === "chat") voice.stop(); setTab(k); }}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2 transition ${tab === k ? "bg-forest text-ivory shadow-sm" : "text-forest/70 hover:text-forest"}`}
                    >
                      <QuickIcon name={k === "chat" ? "chat" : "mic"} small />
                      {k === "chat" ? (tr ? "Yazışma" : "Chat") : (callsEnabled ? (tr ? "Ara" : "Call") : (tr ? "Sesli" : "Voice"))}
                    </button>
                  ))}
                </div>
                <span className="hidden flex-1 md:block" />
                <button onClick={close} aria-label={t.assistant.close} className="flex size-10 items-center justify-center text-forest/70 transition hover:rotate-90 hover:bg-forest/5 hover:text-forest">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" /></svg>
                </button>
              </header>

              {!ready ? (
                <QueueScreen lang={lang} queue={session === "queued" ? queue : null} team={team} />
              ) : tab === "chat" ? (
                <>
                  <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-8" aria-live="polite">
                    <div className="df-rise flex items-start gap-3" style={delay(520)}>
                      <span className="mt-1 hidden sm:block"><Orb size={28} hue={agent?.hue} initial={agent ? agent.name[0] : undefined} /></span>
                      <p className="max-w-[85%] bg-white px-5 py-3.5 text-[15px] leading-relaxed text-ink shadow-sm">{greeting}</p>
                    </div>
                    <p className="flex items-center justify-center gap-2 px-1 text-center text-[10px] leading-snug text-muted">{t.assistant.disclosure}</p>
                    {msgs.length === 0 && (
                      <div className="grid gap-2 md:hidden">
                        {quick.map((q) => (
                          <button key={q.label} onClick={() => runQuick(q.say)} className="flex items-center gap-3 border border-forest/15 bg-white px-4 py-3 text-left text-sm text-forest">
                            <QuickIcon name={q.icon} dark />
                            <span className="flex-1">{q.label}</span>
                            <span aria-hidden>→</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {msgs.map((m, i) => (
                      <div key={m.id ?? i} className={`df-rise ${m.role === "user" ? "flex flex-col items-end" : "sm:pl-10"}`}>
                        {m.attachment && <AttachmentChip file={m.attachment} />}
                        <p className={`max-w-[85%] whitespace-pre-wrap px-5 py-3.5 text-[15px] leading-relaxed ${m.role === "user" ? "bg-forest text-ivory" : "bg-white text-ink shadow-sm"}`}>{m.text}</p>
                        {m.cards && m.cards.length > 0 && <div className="max-w-xl"><Cards cards={m.cards} lang={lang} /></div>}
                        <span className="mt-1 flex items-center gap-1 px-1 text-[10px] text-muted">
                          {m.role === "assistant" && <span>{name} ·</span>}
                          {clock(m.at)}
                          {m.role === "user" && m.status && (
                            <>
                              <Ticks status={m.status} />
                              <span className="sr-only sm:not-sr-only">{m.status === "seen" ? (tr ? "Görüldü" : "Seen") : m.status === "delivered" ? (tr ? "İletildi" : "Delivered") : (tr ? "Gönderildi" : "Sent")}</span>
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                    {typing && (
                      <div className="df-rise flex items-center gap-2 sm:ml-10" role="status">
                        <span className="flex w-16 items-center justify-center gap-1 bg-white px-4 py-3 shadow-sm">
                          <span className="df-dot" />
                          <span className="df-dot [animation-delay:.15s]" />
                          <span className="df-dot [animation-delay:.3s]" />
                        </span>
                        <span className="text-xs text-muted">{tr ? `${name} yazıyor…` : `${name} is typing…`}</span>
                      </div>
                    )}
                  </div>

                  {suggestions.length > 0 && !busy && msgs.length > 0 && (
                    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2 sm:px-8">
                      {suggestions.map((s) => (
                        <button key={s} onClick={() => void ask(s, "text")} className="shrink-0 border border-forest/20 bg-white px-3 py-1.5 text-xs text-forest transition hover:border-forest hover:bg-forest hover:text-ivory">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <ConsentRow consent={consent} setConsent={setConsent} lang={lang} t={t} />
                  <form method="post" onSubmit={send} className="flex gap-2 border-t border-forest/10 bg-white p-3 sm:px-8 sm:py-4">
                    <button
                      type="button"
                      onClick={() => setSheet(true)}
                      disabled={!ready}
                      className="flex w-12 shrink-0 items-center justify-center border border-forest/15 bg-ivory/50 text-forest transition hover:border-forest hover:bg-white disabled:opacity-40"
                      aria-label={tr ? "Röntgen veya gülüş fotoğrafı paylaş" : "Share an X-ray or smile photo"}
                      title={tr ? "Röntgen veya gülüş fotoğrafı paylaş" : "Share an X-ray or smile photo"}
                    >
                      <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path d="M20.5 11.5 12 20a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <label htmlFor="df-assistant-input" className="sr-only">{t.assistant.placeholder}</label>
                    <input
                      id="df-assistant-input"
                      ref={inputRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={800}
                      placeholder={tr ? "Tedaviler, fiyatlar, seyahat…" : "Ask about treatments, prices, travel…"}
                      className="min-w-0 flex-1 border border-forest/15 bg-ivory/50 px-4 py-3 text-[15px] focus:border-forest focus:outline-none"
                    />
                    <button type="submit" disabled={busy || !text.trim()} aria-label={t.assistant.send} className="flex w-12 items-center justify-center bg-forest text-sage transition hover:bg-forest-700 disabled:opacity-40">
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M1 8h12M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
                    </button>
                  </form>
                </>
              ) : (
                callsEnabled ? (
                  <CallPane call={call} lang={lang} name={name} agent={agent} lastAssistant={lastAssistant} consent={consent} setConsent={setConsent} t={t} onBack={() => setTab("chat")} onShare={() => setSheet(true)} />
                ) : (
                  <VoicePane voice={voice} lang={lang} t={t} name={name} opener={opener} lastUser={lastUser?.text} lastAssistant={lastAssistant} consent={consent} setConsent={setConsent} busy={busy} />
                )
              )}
            </div>
            <UploadSheet
              open={sheet}
              onClose={() => setSheet(false)}
              lang={lang}
              getToken={() => tokenRef.current}
              onDone={(f) => {
                const what = `${f.kindLabel.toLowerCase()}${f.treatment ? ` (${f.treatment})` : ""}`;
                if (tab === "voice" && call.state === "connected") {
                  setMsgs((m) => [...m, { id: nextId(), role: "user", text: tr ? `${f.kindLabel} paylaştım.` : `I shared my ${what}.`, at: Date.now(), attachment: f }]);
                  call.notify(`[On screen: the caller just uploaded their ${what}. You cannot see it. Thank them warmly, say the dental team will review it before their consultation, and move towards booking.]`);
                } else {
                  void ask(tr ? `${f.kindLabel} paylaştım${f.treatment ? ` (${f.treatment})` : ""}.` : `I've just shared my ${what}.`, "text", f);
                }
              }}
            />
          </section>
        </div>
      )}
    </>
  );
}

/** Thumbnail shown above a message that carried a shared file. */
function AttachmentChip({ file }: { file: SharedFile }) {
  return (
    <span className="df-rise mb-1.5 flex max-w-[85%] items-center gap-3 border border-forest/15 bg-white p-2 pr-4 shadow-sm">
      {file.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.preview} alt="" className="size-14 object-cover" />
      ) : (
        <span className="flex size-14 items-center justify-center bg-sage-50 text-forest">
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden><path d="M4 5h16v14H4zM8 9v6M12 8v8M16 9v6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-forest">{file.kindLabel}</span>
        <span className="block truncate text-xs text-muted">{file.treatment ?? "—"} · 🔒</span>
      </span>
    </span>
  );
}

function QuickIcon({ name, small = false, dark = false }: { name: string; small?: boolean; dark?: boolean }) {
  const p = { stroke: "currentColor", strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const icons: Record<string, React.ReactNode> = {
    price: <><path d="M4 12l8-8h8v8l-8 8z" {...p} /><circle cx="16" cy="8" r="1.4" {...p} /></>,
    spark: <><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" {...p} /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="1" {...p} /><path d="M4 10h16M9 3v4M15 3v4" {...p} /></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" {...p} /><path d="M5 11a7 7 0 0014 0M12 18v3" {...p} /></>,
    chat: <><path d="M4 5h16v10H9l-5 4z" {...p} /></>,
  };
  return (
    <span className={`flex shrink-0 items-center justify-center ${small ? "" : `size-8 ${dark ? "bg-forest/10 text-forest" : "bg-ivory/10 text-sage"}`}`} aria-hidden>
      <svg viewBox="0 0 24 24" className={small ? "size-3.5" : "size-4"}>{icons[name]}</svg>
    </span>
  );
}

/** Shown while connecting, or while every coordinator is busy (fair first-come-first-served queue). */
function QueueScreen({ lang, queue, team }: { lang: Lang; queue: { position: number; eta: number; online: number } | null; team: TeamMember[] }) {
  const tr = lang === "tr";
  const mins = queue ? Math.max(1, Math.round(queue.eta / 60)) : 0;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-10 text-center" role="status" aria-live="polite">
      <div className="relative flex items-center justify-center">
        <span className="absolute size-40 animate-ping rounded-full bg-sage/20 [animation-duration:2.4s]" aria-hidden />
        <span className="flex -space-x-4">
          {(team.length ? team.slice(0, 5) : [{ name: "D", hue: 100 }]).map((m, i) => (
            <span key={m.name} className="df-rise rounded-full ring-4 ring-ivory" style={{ animationDelay: `${i * 90}ms` }}>
              <Orb size={56} hue={m.hue} initial={m.name[0]} state="thinking" />
            </span>
          ))}
        </span>
      </div>
      {queue ? (
        <>
          <p className="display mt-10 text-4xl text-forest">{tr ? `Sırada ${queue.position}. sıradasınız` : `You're number ${queue.position} in line`}</p>
          <p className="mt-3 text-sm text-muted">
            {tr
              ? `${queue.online} koordinatörümüz şu anda diğer hastalarla ilgileniyor. Tahmini bekleme süresi yaklaşık ${mins} dk.`
              : `All ${queue.online} coordinators are helping other patients right now. Estimated wait about ${mins} min.`}
          </p>
          <p className="mt-6 text-xs text-muted">
            {tr ? "Beklemek istemiyor musunuz? " : "Prefer not to wait? "}
            <Link href="/contact#request" className="text-forest underline">{tr ? "Talep formunu kullanın" : "Use the request form"}</Link>
          </p>
        </>
      ) : (
        <p className="display mt-10 text-3xl text-forest">{tr ? "Sizi bir koordinatöre bağlıyoruz…" : "Connecting you with a coordinator…"}</p>
      )}
    </div>
  );
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function PhoneIcon({ down = false }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-6 ${down ? "rotate-[135deg]" : ""}`} aria-hidden>
      <path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1z" fill="currentColor" />
    </svg>
  );
}

/** Call transcript: only what was said, both sides, as a clean conversation. */
function CallTranscript({ call, name, hue, tr, children }: { call: ReturnType<typeof useCall>; name: string; hue?: number; tr: boolean; children?: React.ReactNode }) {
  const end = useRef<HTMLDivElement>(null);
  const lines = call.partial ? [...call.captions, { who: "agent" as const, text: call.partial, at: call.seconds }] : call.captions;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length, call.partial]);

  return (
    <div className="mx-auto flex min-h-[180px] w-full max-w-xl flex-1 flex-col px-4 sm:px-6">
      <div className="min-h-0 flex-1 overflow-y-auto pb-2 pt-6 [mask-image:linear-gradient(to_bottom,transparent,black_32px)] [scrollbar-width:none]" aria-live="polite">
        {lines.length === 0 && (
          <p className="pt-10 text-center font-display text-lg font-light text-forest/40">{tr ? "Söylenenler burada görünecek" : "Your conversation will appear here"}</p>
        )}
        {lines.map((c, i) => {
          const first = i === 0 || lines[i - 1].who !== c.who;
          const agent = c.who === "agent";
          return (
            <div key={i} className={`df-bubble flex ${agent ? "justify-start" : "justify-end"} ${first ? "mt-4" : "mt-1"}`}>
              <div className={`flex max-w-[85%] items-end gap-2 ${agent ? "" : "flex-row-reverse"}`}>
                {agent && <span className="w-7 shrink-0">{first && <Orb size={28} hue={hue} initial={name[0]} />}</span>}
                <div>
                  {first && <p className={`mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-forest/45 ${agent ? "pl-1" : "pr-1 text-right"}`}>{agent ? name : tr ? "Siz" : "You"}</p>}
                  <p
                    className={`px-4 py-2.5 text-[0.95rem] leading-relaxed ${
                      agent
                        ? "rounded-[20px] rounded-bl-[6px] bg-forest text-ivory shadow-[0_10px_24px_-16px_rgba(31,51,41,0.9)]"
                        : "rounded-[20px] rounded-br-[6px] bg-white text-ink shadow-[0_10px_24px_-18px_rgba(31,51,41,0.6)] ring-1 ring-forest/[0.06]"
                    }`}
                  >
                    {c.text}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {children && <div className="mt-4">{children}</div>}
        <div ref={end} />
      </div>
    </div>
  );
}

/** Phone-style call screen (OpenAI Realtime speech-to-speech). */
function CallPane({
  call, lang, name, agent, lastAssistant, consent, setConsent, t, onBack, onShare,
}: {
  call: ReturnType<typeof useCall>; lang: Lang; name: string; agent: PublicAgent | null; lastAssistant?: Msg; consent: boolean; setConsent: (v: boolean) => void; t: Dict; onBack: () => void; onShare: () => void;
}) {
  const tr = lang === "tr";
  const live = call.state === "connected";
  const orb: VoiceState = call.speaking === "agent" ? "speaking" : call.speaking === "you" ? "listening" : call.state === "ringing" ? "thinking" : "idle";
  const left = call.maxSeconds - call.seconds;
  const status = {
    idle: tr ? `${name} ile sesli görüşme` : `Voice call with ${name}`,
    ringing: tr ? `${name} aranıyor…` : `Calling ${name}…`,
    connected: mmss(call.seconds),
    ended: tr ? `Görüşme bitti · ${mmss(call.seconds)}` : `Call ended · ${mmss(call.seconds)}`,
    failed: tr ? "Arama bağlanamadı" : "Call didn't connect",
  }[call.state];
  const lastCard = [...(lastAssistant?.cards ?? [])].slice(-1);
  const compact = live || call.captions.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-ivory to-[#eef0e6] [scrollbar-width:none]">
      {compact ? (
        // In-call header: one slim row so the transcript gets the room.
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 pt-4 sm:px-6">
          <span className="hidden md:block"><Orb size={48} state={orb} hue={agent?.hue} initial={name[0]} /></span>
          <div className="hidden min-w-0 flex-1 md:block">
            <p className="display truncate text-xl leading-tight text-forest">{name}</p>
            {agent && <p className="truncate text-[10px] uppercase tracking-[0.16em] text-muted">{agent.tagline}</p>}
          </div>
          <div className="flex-1 text-center md:flex-none md:text-right" aria-live="polite">
            <p className={`flex items-center justify-center gap-1.5 text-sm tabular-nums md:justify-end ${live ? "font-medium text-forest" : "text-muted"}`}>
              {live && <span className="inline-block size-2 animate-pulse rounded-full bg-[#4fa36b]" aria-hidden />}
              {status}
            </p>
            {live && call.muted && <p className="text-[10px] text-danger">{tr ? "sessiz" : "muted"}</p>}
            {live && left <= 30 && <p className="text-[10px] text-danger">{tr ? `${left} sn kaldı` : `${left}s left`}</p>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center px-6 pt-8 text-center">
          <div className="relative">
            {call.state === "ringing" && <span className="absolute inset-0 animate-ping rounded-full bg-sage/40 [animation-duration:1.4s]" aria-hidden />}
            <Orb size={132} state={orb} hue={agent?.hue} initial={name[0]} />
          </div>
          <p className="display mt-5 text-3xl text-forest">{name}</p>
          {agent && <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">{agent.tagline}</p>}
          <p className="mt-3 text-sm text-muted" aria-live="polite">{status}</p>
          {call.error && <p role="alert" className="mt-3 max-w-sm text-sm text-danger">{call.error}</p>}
        </div>
      )}

      {compact && (
        <CallTranscript call={call} name={name} hue={agent?.hue} tr={tr}>
          {lastCard.length > 0 && live && <Cards cards={lastCard} lang={lang} />}
        </CallTranscript>
      )}
      {!compact && <div className="flex-1" />}

      <div className={`flex items-center justify-center gap-6 px-6 ${compact ? "py-4" : "py-6"}`}>
        {live || call.state === "ringing" ? (
          <>
            <button
              type="button"
              onClick={call.toggleMute}
              disabled={!live}
              aria-pressed={call.muted}
              className={`flex size-14 items-center justify-center rounded-full border transition ${call.muted ? "border-forest bg-forest text-ivory" : "border-forest/20 bg-white text-forest"} disabled:opacity-40`}
              aria-label={call.muted ? (tr ? "Sesi aç" : "Unmute") : (tr ? "Sessize al" : "Mute")}
            >
              <svg viewBox="0 0 24 24" className="size-6" aria-hidden><rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.7" fill="none" /><path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" strokeWidth="1.7" fill="none" />{call.muted && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" />}</svg>
            </button>
            <button
              type="button"
              onClick={onShare}
              disabled={!live}
              className="flex size-14 items-center justify-center rounded-full border border-forest/20 bg-white text-forest transition hover:border-forest disabled:opacity-40"
              aria-label={tr ? "Fotoğraf paylaş" : "Share a photo"}
              title={tr ? "Röntgen veya gülüş fotoğrafı paylaş" : "Share an X-ray or smile photo"}
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path d="M20.5 11.5 12 20a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" onClick={call.hangUp} className="flex size-16 items-center justify-center rounded-full bg-[#d64545] text-white shadow-lg transition hover:bg-[#c03a3a]" aria-label={tr ? "Görüşmeyi bitir" : "Hang up"}>
              <PhoneIcon down />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => consent && void call.call()}
              disabled={!consent}
              title={consent ? undefined : tr ? "Önce aşağıdaki kutuyu işaretleyin" : "Tick the box below first"}
              className="flex items-center gap-3 rounded-full bg-[#3f9b5f] py-3.5 pl-4 pr-6 text-white shadow-lg transition hover:bg-[#368752] disabled:cursor-not-allowed disabled:bg-[#9db8a4] disabled:shadow-none"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-white/20"><PhoneIcon /></span>
              <span className="text-base font-medium">{call.state === "ended" ? (tr ? "Tekrar ara" : "Call again") : tr ? `${name}'i ara` : `Call ${name}`}</span>
            </button>
            {(call.state === "ended" || call.state === "failed") && (
              <button type="button" onClick={onBack} className="text-sm text-forest underline">{tr ? "Yazışmaya dön" : "Back to chat"}</button>
            )}
          </>
        )}
      </div>
      <p className="px-6 pb-2 text-center text-[10px] leading-snug text-muted">
        {t.assistant.disclosure} {tr ? "Görüşmeler en fazla 5 dakikadır; ses kaydı saklanmaz." : "Calls last up to 5 minutes; audio is never recorded."}
      </p>
      <ConsentRow consent={consent} setConsent={setConsent} lang={lang} t={t} call name={name} />
    </div>
  );
}

function VoicePane({
  voice, lang, t, name, opener, lastUser, lastAssistant, consent, setConsent, busy,
}: {
  voice: ReturnType<typeof useVoice>; lang: Lang; t: Dict; name: string; opener: string; lastUser?: string; lastAssistant?: Msg; consent: boolean; setConsent: (v: boolean) => void; busy: boolean;
}) {
  const tr = lang === "tr";
  const state: VoiceState = busy ? "thinking" : voice.state;
  const label = {
    idle: tr ? "Başlamak için küreye dokunun" : "Tap the orb to start talking",
    listening: tr ? "Dinliyorum…" : "Listening…",
    thinking: tr ? "Düşünüyorum…" : "Thinking…",
    speaking: tr ? `${name} konuşuyor` : `${name} is speaking`,
  }[state];

  if (!voice.supported) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
        <Orb size={110} />
        <p className="text-sm text-ink">
          {tr ? "Bu tarayıcı sesli görüşmeyi desteklemiyor. Chrome, Edge veya Safari deneyin ya da yazışmaya geçin." : "This browser doesn't support voice. Try Chrome, Edge or Safari — or switch to chat."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col items-center px-6 pb-4 pt-8 text-center">
        <button
          type="button"
          onClick={() => (voice.active ? voice.stop() : voice.start(opener))}
          aria-pressed={voice.active}
          aria-label={voice.active ? (tr ? "Görüşmeyi bitir" : "End voice conversation") : (tr ? "Sesli görüşmeyi başlat" : "Start voice conversation")}
          className="rounded-full md:hidden"
        >
          <Orb size={150} state={state} />
        </button>
        <p className="mt-6 text-sm font-medium text-forest" aria-live="polite">{label}</p>
        {voice.interim ? (
          <p className="mt-2 text-sm italic text-muted">“{voice.interim}”</p>
        ) : (
          lastUser && <p className="mt-2 line-clamp-2 text-xs text-muted">{tr ? "Siz" : "You"}: “{lastUser}”</p>
        )}
        {voice.error && <p role="alert" className="mt-3 text-xs text-danger">{voice.error}</p>}
        <div className="mt-5">
          {voice.active ? (
            <button onClick={voice.stop} className="border border-forest/25 bg-white px-5 py-2 text-xs font-medium uppercase tracking-[0.14em] text-forest">{tr ? "Bitir" : "End"}</button>
          ) : (
            <button onClick={() => voice.start(opener)} className="bg-forest px-5 py-2 text-xs font-medium uppercase tracking-[0.14em] text-sage">{tr ? "Konuşmaya başla" : "Start talking"}</button>
          )}
        </div>
      </div>
      {lastAssistant && (
        <div className="df-rise mx-4 mb-3 bg-white p-4 text-sm leading-relaxed text-ink shadow-sm">
          {lastAssistant.text}
          {lastAssistant.cards && lastAssistant.cards.length > 0 && <Cards cards={lastAssistant.cards} lang={lang} />}
        </div>
      )}
      <p className="mx-4 mb-3 text-[10px] leading-snug text-muted">
        {t.assistant.disclosure}{" "}
        {tr
          ? "Sesli mod tarayıcınızın konuşma tanıma hizmetini kullanır; ses tarayıcı sağlayıcınız tarafından işlenebilir. Ses kaydı saklamıyoruz."
          : "Voice uses your browser's speech recognition, which may be processed by your browser provider. We never store audio."}
      </p>
      <div className="mt-auto">
        <ConsentRow consent={consent} setConsent={setConsent} lang={lang} t={t} />
      </div>
    </div>
  );
}
