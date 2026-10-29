"use client";

import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";

export type SharedFile = { kind: "XRAY" | "SMILE_PHOTO" | "OTHER"; kindLabel: string; treatment: string | null; preview: string | null };
type Treatment = { slug: string; name: Record<Lang, string> };

const KINDS = [
  { kind: "XRAY", en: "X-ray", tr: "Röntgen", hintEn: "Panoramic or any recent dental X-ray", hintTr: "Panoramik veya yakın tarihli diş röntgeni", icon: "M4 5h16v14H4zM8 9v6M12 8v8M16 9v6" },
  { kind: "SMILE_PHOTO", en: "Smile photo", tr: "Gülüş fotoğrafı", hintEn: "A clear, front-facing smile in good light", hintTr: "İyi ışıkta, karşıdan net bir gülüş", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01" },
] as const;

let treatmentCache: Treatment[] | null = null;

/** Optional: share an X-ray or smile photo so the team can prepare. Never required. */
export function UploadSheet({ open, onClose, onDone, lang, getToken }: {
  open: boolean; onClose: () => void; onDone: (f: SharedFile) => void; lang: Lang; getToken: () => string | null;
}) {
  const tr = lang === "tr";
  const [kind, setKind] = useState<SharedFile["kind"]>("XRAY");
  const [treatment, setTreatment] = useState<string | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>(treatmentCache ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || treatmentCache) return;
    fetch("/api/public/treatments")
      .then((r) => r.json())
      .then((d) => {
        treatmentCache = (d.treatments ?? []).filter((t: Treatment) => t.slug !== "consultation");
        setTreatments(treatmentCache!);
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return setError(tr ? "Lütfen 8 MB'tan küçük bir dosya seçin." : "Please choose a file under 8 MB.");
    setFile(f);
    setPreview(f.type.startsWith("image/") && !/heic/i.test(f.type) ? URL.createObjectURL(f) : null);
  };

  const submit = async () => {
    const token = getToken();
    if (!file || !agree || !token) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("conversationToken", token);
    body.set("kind", kind);
    if (treatment) body.set("treatment", treatment);
    body.set("consent", "true");
    body.set("file", file);
    try {
      const res = await fetch("/api/assistant/upload", { method: "POST", body });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message ?? "Upload failed");
      const k = KINDS.find((x) => x.kind === kind);
      onDone({
        kind,
        kindLabel: k ? (tr ? k.tr : k.en) : tr ? "Dosya" : "File",
        treatment: treatments.find((t) => t.slug === treatment)?.name[lang] ?? null,
        preview,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-forest/35 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={tr ? "Fotoğraf paylaş" : "Share a photo"}
        className="df-sheet max-h-[92%] w-full overflow-y-auto rounded-t-[28px] bg-ivory p-5 shadow-[0_-20px_60px_-20px_rgba(20,35,28,0.5)] sm:max-w-md sm:rounded-[28px] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-forest/15 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-2xl text-forest">{tr ? "Fotoğraf paylaşın" : "Share a photo"}</p>
            <p className="mt-1 text-sm text-muted">{tr ? "İsteğe bağlı. Ekibimizin görüşmenize hazırlanmasına yardımcı olur." : "Optional. It helps our team prepare for your call."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-forest/60 hover:bg-forest/5" aria-label={tr ? "Kapat" : "Close"}>
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {KINDS.map((k) => {
            const on = kind === k.kind;
            return (
              <button
                key={k.kind}
                type="button"
                onClick={() => setKind(k.kind)}
                aria-pressed={on}
                className={`rounded-2xl border p-3.5 text-left transition ${on ? "border-forest bg-forest text-ivory shadow-lg" : "border-forest/15 bg-white text-forest hover:border-forest/40"}`}
              >
                <svg viewBox="0 0 24 24" className={`size-6 ${on ? "text-sage" : "text-forest/70"}`} aria-hidden><path d={k.icon} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <p className="mt-2 font-medium">{tr ? k.tr : k.en}</p>
                <p className={`mt-0.5 text-[11px] leading-snug ${on ? "text-ivory/65" : "text-muted"}`}>{tr ? k.hintTr : k.hintEn}</p>
              </button>
            );
          })}
        </div>

        <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-forest/55">{tr ? "Hangi tedavi için?" : "Which treatment is it for?"}</p>
        <div className="flex flex-wrap gap-2">
          {treatments.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => setTreatment(treatment === t.slug ? null : t.slug)}
              aria-pressed={treatment === t.slug}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${treatment === t.slug ? "border-forest bg-forest text-ivory" : "border-forest/15 bg-white text-forest hover:border-forest/40"}`}
            >
              {t.name[lang]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTreatment(null)}
            aria-pressed={treatment === null}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${treatment === null ? "border-forest bg-forest text-ivory" : "border-forest/15 bg-white text-forest hover:border-forest/40"}`}
          >
            {tr ? "Emin değilim" : "Not sure yet"}
          </button>
        </div>

        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="mt-5 flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-forest/20 bg-white p-4 text-left transition hover:border-forest/50"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-sage-50 text-forest">
              <svg viewBox="0 0 24 24" className="size-7" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-forest">{file ? file.name : tr ? "Dosya seçin veya fotoğraf çekin" : "Choose a file or take a photo"}</span>
            <span className="block text-xs text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "JPG, PNG, WebP, HEIC, PDF · max 8 MB"}</span>
          </span>
        </button>

        <label className="mt-4 flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-ink/80">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[#1f3329]" />
          <span>
            {tr
              ? "Bu görüntünün, görüşmeme hazırlanmak amacıyla Dent Flex dental ekibi tarafından saklanmasına ve incelenmesine izin veriyorum. Yapay zekâ ile paylaşılmaz."
              : "I agree Dent Flex may store this image so the dental team can review it before my consultation. It is not shared with the AI."}
          </span>
        </label>

        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!file || !agree || busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-forest py-3.5 font-medium text-ivory transition hover:bg-forest-700 disabled:opacity-40"
        >
          {busy ? (tr ? "Yükleniyor…" : "Uploading…") : tr ? "Güvenle paylaş" : "Share securely"}
        </button>
      </div>
    </div>
  );
}
