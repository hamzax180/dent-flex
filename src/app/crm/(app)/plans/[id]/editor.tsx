"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { callApi } from "@/components/crm/actions";
import { Icon } from "@/components/crm/icons";
import { inputCls } from "@/components/crm/ui";

type Currency = "EUR" | "GBP" | "USD" | "TRY";
type Item = { treatment: string; area: string; qty: number; unitMinor: number; currency: Currency };
type Preset = { name: string; unitMinor: number; currency: Currency; published: boolean };

const money = (minor: number, cur: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);

export function PlanEditor({
  planId, status, initialItems, initialNotes, initialValidUntil, presets, canEdit, hasEmail, link, whatsapp, phone,
}: {
  planId: string; status: string; initialItems: Item[]; initialNotes: string; initialValidUntil: string; presets: Preset[];
  canEdit: boolean; hasEmail: boolean; link: string | null; whatsapp: string; phone: string | null;
}) {
  const router = useRouter();
  const locked = status === "SENT" || status === "ACCEPTED" || !canEdit;
  const [items, setItems] = useState<Item[]>(initialItems.length ? initialItems : []);
  const [notes, setNotes] = useState(initialNotes);
  const [validUntil, setValidUntil] = useState(initialValidUntil || new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sentLink, setSentLink] = useState<string | null>(link);
  const [copied, setCopied] = useState(false);
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const i of items) t[i.currency] = (t[i.currency] ?? 0) + i.qty * i.unitMinor;
    return Object.entries(t);
  }, [items]);
  const fullLink = sentLink && sentLink.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${sentLink}` : sentLink;

  const set = (n: number, patch: Partial<Item>) => setItems(items.map((it, i) => (i === n ? { ...it, ...patch } : it)));
  const add = (p?: Preset) => setItems([...items, { treatment: p?.name ?? "", area: "", qty: 1, unitMinor: p?.unitMinor ?? 0, currency: p?.currency ?? (items.at(-1)?.currency ?? "EUR") }]);
  const payload = () => ({ items: items.filter((i) => i.treatment.trim()), notes: notes.trim() || null, validUntil: validUntil || null });

  const save = async () => {
    setBusy("save");
    setMsg(null);
    try {
      await callApi("PATCH", `/api/admin/plans/${planId}`, payload());
      setMsg({ ok: true, text: "Draft saved." });
      router.refresh();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy(null);
    }
  };
  const send = async () => {
    if (!window.confirm("Send this plan to the patient? It can't be edited after sending.")) return;
    if (!(await save())) return;
    setBusy("send");
    try {
      const r = (await callApi("POST", `/api/admin/plans/${planId}/send`)) as { link: string; emailed: boolean };
      setSentLink(r.link);
      setMsg({ ok: true, text: r.emailed ? "Sent. The patient has been emailed their private link." : "Plan locked. Share the link below with the patient (email isn't set up or they gave no email)." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const patientWa = phone && fullLink ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi, your Dent Flex treatment plan is ready: ${fullLink}`)}` : null;

  return (
    <section className="rounded-3xl border border-forest/[0.08] bg-white p-6 shadow-[0_12px_32px_-22px_rgba(31,51,41,0.3)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-2xl text-forest">The plan</h2>
        {locked && <span className="rounded-full bg-sage-50 px-3 py-1 text-xs text-forest">🔒 {status === "SENT" || status === "ACCEPTED" ? "Sent: read-only" : "Read-only"}</span>}
      </div>

      <div className="space-y-2.5">
        {items.length === 0 && <p className="rounded-2xl border border-dashed border-forest/20 p-6 text-center text-sm text-muted">No lines yet. Add a treatment below.</p>}
        {items.map((it, n) => (
          <div key={n} className="grid grid-cols-12 items-center gap-2 rounded-2xl bg-[#f8f8f3] p-3">
            <input disabled={locked} value={it.treatment} onChange={(e) => set(n, { treatment: e.target.value })} list="plan-presets" placeholder="Treatment" className={`${inputCls} col-span-12 sm:col-span-4`} />
            <input disabled={locked} value={it.area} onChange={(e) => set(n, { area: e.target.value })} placeholder="Area / tooth (e.g. 36, upper arch)" className={`${inputCls} col-span-12 sm:col-span-3`} />
            <input disabled={locked} type="number" min={1} max={32} value={it.qty} onChange={(e) => set(n, { qty: Math.max(1, Number(e.target.value) || 1) })} aria-label="Quantity" className={`${inputCls} col-span-3 sm:col-span-1`} />
            <input disabled={locked} type="number" min={0} step="0.01" value={it.unitMinor / 100} onChange={(e) => set(n, { unitMinor: Math.round((Number(e.target.value) || 0) * 100) })} aria-label="Unit price" className={`${inputCls} col-span-5 sm:col-span-2`} />
            <select disabled={locked} value={it.currency} onChange={(e) => set(n, { currency: e.target.value as Currency })} aria-label="Currency" className={`${inputCls} col-span-3 sm:col-span-1`}>
              {(["EUR", "GBP", "USD", "TRY"] as const).map((c) => <option key={c}>{c}</option>)}
            </select>
            {!locked && (
              <button type="button" onClick={() => setItems(items.filter((_, i) => i !== n))} aria-label="Remove line" className="col-span-1 flex justify-center rounded-lg p-2 text-muted hover:bg-white hover:text-danger">
                <Icon name="x" className="size-4" />
              </button>
            )}
          </div>
        ))}
        <datalist id="plan-presets">{presets.map((p) => <option key={p.name} value={p.name} />)}</datalist>
      </div>

      {!locked && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => add()} className="flex items-center gap-1.5 rounded-xl border border-forest/15 px-3 py-1.5 text-sm text-forest hover:bg-sage-50"><Icon name="plus" className="size-4" /> Add line</button>
          {presets.map((p) => (
            <button key={p.name} type="button" onClick={() => add(p)} className="rounded-xl bg-sage-50 px-3 py-1.5 text-sm text-forest hover:bg-sage/40" title={p.published ? `Published price ${money(p.unitMinor, p.currency)}` : "No published price: enter the amount"}>
              + {p.name}{p.published ? ` · ${money(p.unitMinor, p.currency)}` : ""}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <div className="min-w-60 rounded-2xl bg-forest px-5 py-4 text-ivory">
          <p className="text-[11px] uppercase tracking-[0.16em] text-sage">Estimated total</p>
          {totals.length === 0 ? <p className="font-display text-3xl">—</p> : totals.map(([c, v]) => <p key={c} className="font-display text-3xl">{money(v, c)}</p>)}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
        <label className="text-xs font-medium text-muted">Note to the patient
          <textarea disabled={locked} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you'd recommend and why, stages, how long they'd stay in Istanbul…" className={`${inputCls} mt-1.5 block w-full resize-y`} />
        </label>
        <label className="text-xs font-medium text-muted">Valid until
          <input disabled={locked} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={`${inputCls} mt-1.5 block`} />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">The patient&apos;s page always says this is an estimate and the final plan is confirmed after an examination.</p>

      {msg && <p role="status" className={`mt-4 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-[#e6f2e8] text-[#2f6b45]" : "bg-danger/10 text-danger"}`}>{msg.text}</p>}

      {!locked && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={save} className="rounded-xl border border-forest/20 px-5 py-2.5 font-medium text-forest hover:bg-sage-50 disabled:opacity-50">{busy === "save" ? "Saving…" : "Save draft"}</button>
          <button type="button" disabled={!!busy || items.filter((i) => i.treatment.trim()).length === 0} onClick={send} className="flex items-center gap-2 rounded-xl bg-forest px-5 py-2.5 font-medium text-ivory hover:bg-forest-700 disabled:opacity-50">
            {busy === "send" ? "Sending…" : <>Send to patient <span aria-hidden>→</span></>}
          </button>
          {!hasEmail && <span className="self-center text-xs text-muted">No email on file: you&apos;ll get a link to share.</span>}
        </div>
      )}

      {fullLink && (
        <div className="mt-5 rounded-2xl bg-[#f8f8f3] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Patient&apos;s private link</p>
          <p className="mt-1 break-all font-mono text-xs text-forest">{fullLink}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={async () => { await navigator.clipboard.writeText(fullLink).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="rounded-lg bg-forest px-3 py-1.5 text-sm text-ivory">{copied ? "Copied ✓" : "Copy link"}</button>
            <a href={fullLink} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-forest/15 px-3 py-1.5 text-sm text-forest hover:bg-white">Preview</a>
            {patientWa && <a href={patientWa} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25d366] px-3 py-1.5 text-sm text-white">Send via WhatsApp</a>}
          </div>
          {!whatsapp && <p className="mt-2 text-[11px] text-muted">Tip: add the clinic&apos;s WhatsApp number in Settings so patients can reply from their plan.</p>}
        </div>
      )}
    </section>
  );
}
