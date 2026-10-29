import Link from "next/link";
import type { LeadStatus, ScoreBand } from "@prisma/client";
import { Icon, type IconName } from "./icons";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", APPOINTMENT_REQUESTED: "Appt. requested", APPOINTMENT_CONFIRMED: "Appt. confirmed",
  VISITED: "Visited", TREATMENT_PROPOSED: "Treatment proposed", WON: "Won", LOST: "Lost", NURTURE: "Nurture",
};
export const PIPELINE: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "APPOINTMENT_REQUESTED", "APPOINTMENT_CONFIRMED", "VISITED", "TREATMENT_PROPOSED", "WON", "LOST", "NURTURE"];

export function PageHeader({ title, sub, eyebrow, children }: { title: string; sub?: string; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-forest/50">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-light tracking-tight text-forest md:text-[2.1rem]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Card({ title, icon, children, className = "", actions }: { title?: string; icon?: IconName; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-forest/[0.08] bg-white p-5 shadow-[0_1px_2px_rgba(31,51,41,0.04),0_12px_32px_-20px_rgba(31,51,41,0.25)] ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && (
            <h2 className="flex items-center gap-2 text-[0.9rem] font-semibold text-ink">
              {icon && <span className="flex size-7 items-center justify-center rounded-lg bg-sage-50 text-forest"><Icon name={icon} className="size-4" /></span>}
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Metric({ label, value, href, tone = "default", icon, hint, children }: {
  label: string; value: number | string; href?: string; tone?: "default" | "warn" | "dark"; icon?: IconName; hint?: string; children?: React.ReactNode;
}) {
  const warn = tone === "warn" && Number(value) > 0;
  const dark = tone === "dark";
  const body = (
    <div
      className={`group relative h-full overflow-hidden rounded-2xl border p-5 transition duration-200 ${href ? "hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-20px_rgba(31,51,41,0.45)]" : ""} ${
        dark ? "border-forest bg-forest text-ivory" : warn ? "border-[#e5735f]/30 bg-[#fdf3f0]" : "border-forest/[0.08] bg-white shadow-[0_1px_2px_rgba(31,51,41,0.04)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-sage" : "text-muted"}`}>{label}</p>
        {icon && (
          <span className={`flex size-8 items-center justify-center rounded-xl ${dark ? "bg-ivory/10 text-sage" : warn ? "bg-[#e5735f]/15 text-[#c4523d]" : "bg-sage-50 text-forest"}`}>
            <Icon name={icon} className="size-4" />
          </span>
        )}
      </div>
      <p className={`mt-2 font-display text-4xl font-light tabular-nums ${dark ? "text-ivory" : warn ? "text-[#c4523d]" : "text-forest"}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${dark ? "text-ivory/60" : "text-muted"}`}>{hint}</p>}
      {children}
      {href && <Icon name="arrow" className={`absolute bottom-5 right-5 size-4 opacity-0 transition group-hover:opacity-60 ${dark ? "text-ivory" : "text-forest"}`} />}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/** Initials avatar with a stable hue per name. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-forest"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 32% 86%)` }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
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
  const t = { default: "bg-sage-50 text-ink border-forest/10", good: "bg-[#e6f2e8] text-[#2f6b45] border-[#2f6b45]/15", warn: "bg-gold/20 text-ink border-gold/40", bad: "bg-danger/10 text-danger border-danger/20" }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-forest/20 bg-[#fafaf6] p-8 text-center text-sm text-muted">{children}</p>;
}

const TZ = process.env.CLINIC_TIMEZONE || "Europe/Istanbul";
/** All CRM times render in the clinic timezone. */
export function fmt(d: Date | string | null | undefined, style: "datetime" | "date" = "datetime") {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", style === "date" ? { dateStyle: "medium", timeZone: TZ } : { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(d));
}

export const th = "bg-[#f8f8f3] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted";
export const td = "px-4 py-3 align-top";
export const inputCls = "rounded-xl border border-forest/15 bg-white px-3 py-2 text-sm shadow-[inset_0_1px_2px_rgba(31,51,41,0.04)] transition focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10";
