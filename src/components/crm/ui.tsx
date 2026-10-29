import Link from "next/link";
import type { LeadStatus, ScoreBand } from "@prisma/client";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", APPOINTMENT_REQUESTED: "Appt. requested", APPOINTMENT_CONFIRMED: "Appt. confirmed",
  VISITED: "Visited", TREATMENT_PROPOSED: "Treatment proposed", WON: "Won", LOST: "Lost", NURTURE: "Nurture",
};
export const PIPELINE: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "APPOINTMENT_REQUESTED", "APPOINTMENT_CONFIRMED", "VISITED", "TREATMENT_PROPOSED", "WON", "LOST", "NURTURE"];

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-forest">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-forest/10 bg-white p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Metric({ label, value, href, tone = "default" }: { label: string; value: number | string; href?: string; tone?: "default" | "warn" }) {
  const body = (
    <div className={`rounded-xl border bg-white p-4 ${tone === "warn" && Number(value) > 0 ? "border-danger/30" : "border-forest/10"}`}>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "warn" && Number(value) > 0 ? "text-danger" : "text-forest"}`}>{value}</p>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

const BAND_STYLE: Record<ScoreBand, string> = {
  HOT: "bg-forest text-ivory",
  WARM: "bg-gold/25 text-ink",
  LOW_INFORMATION: "bg-sage-50 text-muted border border-forest/10",
};
const BAND_LABEL: Record<ScoreBand, string> = { HOT: "Hot", WARM: "Warm", LOW_INFORMATION: "Low info" };

/** Text label + number so status never depends on colour alone. */
export function ScoreBadge({ total, band, override }: { total: number; band: ScoreBand; override?: number | null }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${BAND_STYLE[band]}`}>
      {BAND_LABEL[band]} · {override ?? total}
      {override != null && <span title={`Calculated ${total}, staff override`}>*</span>}
    </span>
  );
}

export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const t = { default: "bg-sage-50 text-ink border-forest/10", good: "bg-forest/10 text-forest border-forest/20", warn: "bg-gold/20 text-ink border-gold/40", bad: "bg-danger/10 text-danger border-danger/20" }[tone];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${t}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-forest/20 p-6 text-center text-sm text-muted">{children}</p>;
}

const TZ = process.env.CLINIC_TIMEZONE || "Europe/Istanbul";
/** All CRM times render in the clinic timezone. */
export function fmt(d: Date | string | null | undefined, style: "datetime" | "date" = "datetime") {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", style === "date" ? { dateStyle: "medium", timeZone: TZ } : { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(d));
}

export const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted";
export const td = "px-3 py-2 align-top";
export const inputCls = "rounded-lg border border-forest/20 bg-white px-3 py-1.5 text-sm focus:border-forest focus:outline-none";
