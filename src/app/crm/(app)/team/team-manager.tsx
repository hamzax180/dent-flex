"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "@/components/crm/actions";
import { Icon, type IconName } from "@/components/crm/icons";
import { Avatar, inputCls } from "@/components/crm/ui";

type Role = "ADMIN" | "RECEPTIONIST" | "CLINICIAN";
export type Member = { id: string; name: string; email: string; role: Role; active: boolean; createdAt: string; lastSeen: string | null; leads: number; tasks: number };

export const ROLES: { role: Role; label: string; icon: IconName; blurb: string }[] = [
  { role: "RECEPTIONIST", label: "Receptionist", icon: "phone", blurb: "Handles leads, calls, appointments, tasks and conversations." },
  { role: "CLINICIAN", label: "Clinician", icon: "tooth", blurb: "Sees their patients and appointments. Contact details are masked." },
  { role: "ADMIN", label: "Admin", icon: "cog", blurb: "Full access: prices, settings, AI agents, automation and staff." },
];
const ROLE_TONE: Record<Role, string> = {
  ADMIN: "bg-forest text-ivory",
  RECEPTIONIST: "bg-sage/40 text-forest",
  CLINICIAN: "bg-[#e6eef5] text-[#2f4f6b]",
};

/** A readable random password: 4 words-ish chunks + digits, generated in the browser. */
function generatePassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

function PasswordField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex gap-2">
        <input id={id} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} minLength={12} autoComplete="new-password" className={`${inputCls} min-w-0 flex-1 font-mono`} placeholder="At least 12 characters" />
        <button type="button" onClick={() => setShown((v) => !v)} className="rounded-xl border border-forest/15 bg-white px-3 text-xs text-forest hover:bg-sage-50">{shown ? "Hide" : "Show"}</button>
      </div>
      <div className="mt-2 flex gap-3 text-xs">
        <button
          type="button"
          onClick={() => {
            onChange(generatePassword());
            setShown(true);
          }}
          className="font-medium text-forest underline-offset-4 hover:underline"
        >
          Generate strong password
        </button>
        {value && (
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(value).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-forest underline-offset-4 hover:underline"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        )}
        <span className={value.length >= 12 ? "text-[#2f6b45]" : "text-muted"}>{value.length}/12+</span>
      </div>
    </div>
  );
}

function AddMember({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("RECEPTIONIST");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done)
    return (
      <div className="crm-pop rounded-2xl bg-[#e6f2e8] p-5 text-[#2f6b45]">
        <p className="flex items-center gap-2 font-semibold"><Icon name="check" className="size-5" /> {done} can now sign in</p>
        <p className="mt-1 text-sm text-[#2f6b45]/80">Share the sign-in address <b>/crm/login</b>, their email and the password with them privately (not by email). They can change it in <b>My account</b>.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => { setDone(null); setName(""); setEmail(""); setPassword(""); }} className="rounded-xl bg-forest px-4 py-2 text-sm font-medium text-ivory">Add another</button>
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-forest hover:bg-white/60">Close</button>
        </div>
      </div>
    );

  return (
    <form
      className="crm-pop space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await callApi("POST", "/api/admin/users", { name, email, role, password });
          setDone(name.split(" ")[0] || name);
          router.refresh();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted">Full name<input required value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1.5 block w-full`} placeholder="e.g. Ayşe Yılmaz" /></label>
        <label className="text-xs font-medium text-muted">Work email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} mt-1.5 block w-full`} placeholder="name@clinic.com" /></label>
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted">Role</legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {ROLES.map((r) => (
            <label key={r.role} className="cursor-pointer">
              <input type="radio" name="role" value={r.role} checked={role === r.role} onChange={() => setRole(r.role)} className="peer sr-only" />
              <span className="flex h-full flex-col gap-2 rounded-2xl border border-forest/10 bg-white p-4 transition peer-checked:border-forest peer-checked:bg-forest peer-checked:text-ivory peer-checked:shadow-lg peer-focus-visible:ring-4 peer-focus-visible:ring-forest/20 hover:border-forest/30">
                <Icon name={r.icon} className="size-5 opacity-80" />
                <span className="font-semibold">{r.label}</span>
                <span className="text-xs leading-snug opacity-70">{r.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="new-pw" className="mb-1.5 block text-xs font-medium text-muted">Temporary password</label>
        <PasswordField id="new-pw" value={password} onChange={setPassword} />
      </div>
      {err && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      <div className="flex gap-2">
        <button disabled={busy || password.length < 12} className="rounded-xl bg-forest px-5 py-2.5 font-medium text-ivory transition hover:bg-forest-700 disabled:opacity-50">{busy ? "Creating…" : "Create account"}</button>
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-forest hover:bg-forest/5">Cancel</button>
      </div>
    </form>
  );
}

function MemberCard({ m, me }: { m: Member; me: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "password">("view");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const lastSeen = m.lastSeen ? new Date(m.lastSeen) : null;
  const ago = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 60000) : null;
  const seenText = ago === null ? "Never signed in" : ago < 5 ? "Active now" : ago < 60 ? `Active ${ago}m ago` : ago < 1440 ? `Active ${Math.round(ago / 60)}h ago` : `Active ${Math.round(ago / 1440)}d ago`;

  return (
    <article className={`rounded-2xl border bg-white p-5 transition ${m.active ? "border-forest/[0.08] shadow-[0_1px_2px_rgba(31,51,41,0.04),0_12px_32px_-22px_rgba(31,51,41,0.3)]" : "border-dashed border-forest/15 opacity-70"}`}>
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar name={m.name} size={44} />
          <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white ${!m.active ? "bg-forest/25" : ago !== null && ago < 5 ? "bg-[#4fa36b]" : "bg-sage"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{m.name}{me && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}</p>
          <p className="truncate text-xs text-muted">{m.email}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ROLE_TONE[m.role]}`}>{ROLES.find((r) => r.role === m.role)?.label}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-[#f7f7f2] py-2"><p className="font-display text-xl text-forest">{m.leads}</p><p className="text-[10px] uppercase tracking-wide text-muted">Leads</p></div>
        <div className="rounded-xl bg-[#f7f7f2] py-2"><p className="font-display text-xl text-forest">{m.tasks}</p><p className="text-[10px] uppercase tracking-wide text-muted">Open tasks</p></div>
        <div className="rounded-xl bg-[#f7f7f2] px-1 py-2"><p className="truncate text-xs font-medium text-forest">{m.active ? seenText : "Deactivated"}</p><p className="text-[10px] uppercase tracking-wide text-muted">Status</p></div>
      </div>

      {mode === "password" ? (
        <div className="mt-4 space-y-3 rounded-xl bg-[#f7f7f2] p-3">
          <PasswordField id={`pw-${m.id}`} value={pw} onChange={setPw} />
          <div className="flex gap-2">
            <button disabled={busy || pw.length < 12} onClick={() => act(() => callApi("POST", `/api/admin/users/${m.id}/password`, { password: pw }), "Password changed. They've been signed out everywhere.").then(() => { setMode("view"); setPw(""); })} className="rounded-lg bg-forest px-3 py-1.5 text-sm text-ivory disabled:opacity-50">Save password</button>
            <button onClick={() => setMode("view")} className="rounded-lg px-3 py-1.5 text-sm text-forest hover:bg-white">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`role-${m.id}`}>Role</label>
          <select
            id={`role-${m.id}`}
            value={m.role}
            disabled={busy || me || !m.active}
            onChange={(e) => act(() => callApi("PATCH", `/api/admin/users/${m.id}`, { role: e.target.value }), "Role updated.")}
            className={`${inputCls} py-1.5`}
          >
            {ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
          </select>
          <button onClick={() => setMode("password")} disabled={busy} className="rounded-lg border border-forest/15 px-3 py-1.5 text-sm text-forest hover:bg-sage-50">Reset password</button>
          {!me && (
            <button
              disabled={busy}
              onClick={() => (m.active ? window.confirm(`Deactivate ${m.name}? They'll be signed out and can't sign in until reactivated.`) : true) && act(() => callApi("PATCH", `/api/admin/users/${m.id}`, { active: !m.active }), m.active ? "Deactivated." : "Reactivated.")}
              className={`ml-auto rounded-lg px-3 py-1.5 text-sm ${m.active ? "text-danger hover:bg-danger/5" : "bg-forest text-ivory"}`}
            >
              {m.active ? "Deactivate" : "Reactivate"}
            </button>
          )}
        </div>
      )}
      {msg && <p className={`mt-3 text-xs ${msg.ok ? "text-[#2f6b45]" : "text-danger"}`}>{msg.text}</p>}
    </article>
  );
}

export function TeamManager({ members, meId }: { members: Member[]; meId: string }) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | Role | "inactive">("all");
  const shown = members.filter((m) => (filter === "all" ? m.active : filter === "inactive" ? !m.active : m.active && m.role === filter));
  const count = (f: typeof filter) => members.filter((m) => (f === "all" ? m.active : f === "inactive" ? !m.active : m.active && m.role === f)).length;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-forest/[0.08] bg-white p-6 shadow-[0_12px_32px_-22px_rgba(31,51,41,0.3)]">
        {adding ? (
          <>
            <h2 className="mb-5 font-display text-2xl text-forest">Add a staff member</h2>
            <AddMember onClose={() => setAdding(false)} />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-sage-50 text-forest"><Icon name="users" className="size-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">Give your team their own sign-in</p>
              <p className="text-sm text-muted">Each person gets a role that decides what they can see and do. Every action is logged under their name.</p>
            </div>
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-xl bg-forest px-5 py-2.5 font-medium text-ivory shadow-sm transition hover:bg-forest-700">
              <Icon name="plus" className="size-4" /> Add staff member
            </button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {([["all", "Active"], ["RECEPTIONIST", "Receptionists"], ["CLINICIAN", "Clinicians"], ["ADMIN", "Admins"], ["inactive", "Deactivated"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${filter === k ? "bg-forest text-ivory" : "bg-white text-forest ring-1 ring-forest/10 hover:ring-forest/30"}`}
          >
            {label} <span className="ml-1 opacity-60">{count(k)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-forest/20 bg-[#fafaf6] p-8 text-center text-sm text-muted">No one here yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((m) => <MemberCard key={m.id} m={m} me={m.id === meId} />)}
        </div>
      )}
    </div>
  );
}
