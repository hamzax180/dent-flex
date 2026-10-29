"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { validateGraph } from "@/lib/automation/graph";
import { AUTOMATION_EVENT_TYPES } from "@/lib/jobs";
import { callApi } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

type Node = { id: string; type: string; label?: string; config: Record<string, unknown> };
type Edge = { from: string; to: string; branch?: "true" | "false" };
type Graph = { nodes: Node[]; edges: Edge[]; settings: { stopOn: string[]; goalStatuses: string[]; allowReenrollment: boolean } };

const DEFAULTS: Record<string, Record<string, unknown>> = {
  condition: { check: "has_permission", channel: "EMAIL", purpose: "MARKETING" },
  delay: { mode: "duration", minutes: 60 },
  action: { action: "create_task", title: "Follow up", dueInMinutes: 60, assignTo: "owner" },
  exit: { reason: "done" },
};
const TYPE_STYLE: Record<string, string> = {
  trigger: "border-forest bg-forest text-ivory",
  condition: "border-gold bg-gold/10",
  delay: "border-sage bg-sage-50",
  action: "border-forest/30 bg-white",
  exit: "border-forest/20 bg-ivory",
};
const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "APPOINTMENT_REQUESTED", "APPOINTMENT_CONFIRMED", "VISITED", "TREATMENT_PROPOSED", "WON", "LOST", "NURTURE"];

function summary(n: Node): string {
  const c = n.config;
  switch (n.type) {
    case "trigger": return `When ${(c.events as string[] | undefined)?.join(" or ")}`;
    case "condition": return `If ${String(c.check).replace(/_/g, " ")}${c.channel ? ` (${String(c.channel).toLowerCase()} ${String(c.purpose ?? "").toLowerCase()})` : ""}${c.statuses ? `: ${(c.statuses as string[]).join(", ")}` : ""}${c.status ? `: ${c.status}` : ""}`;
    case "delay": return c.mode === "duration" ? `Wait ${c.minutes} min` : c.mode === "clinic_time" ? `Wait until day +${c.afterDays} at ${c.time}` : `Until ${c.minutes} min before appointment`;
    case "action": return `${String(c.action).replace(/_/g, " ")}${c.templateKey ? ` “${c.templateKey}” via ${String(c.channel).toLowerCase()} (${String(c.purpose).toLowerCase()})` : c.title ? `: ${c.title}` : c.tag ? `: ${c.tag}` : c.status ? ` → ${c.status}` : ""}`;
    case "exit": return `Exit: ${c.reason}`;
  }
  return "";
}

/** Layered layout: depth = longest path from the trigger, so branches sit side by side. */
function layers(g: Graph): Node[][] {
  const depth = new Map<string, number>();
  const trigger = g.nodes.find((n) => n.type === "trigger");
  if (!trigger) return [g.nodes];
  const visit = (id: string, d: number, seen: Set<string>) => {
    if (seen.has(id)) return;
    if ((depth.get(id) ?? -1) >= d) return;
    depth.set(id, d);
    const next = new Set(seen).add(id);
    for (const e of g.edges.filter((x) => x.from === id)) visit(e.to, d + 1, next);
  };
  visit(trigger.id, 0, new Set());
  const rows: Node[][] = [];
  for (const n of g.nodes) {
    const d = depth.get(n.id) ?? rows.length + 50;
    (rows[d] ??= []).push(n);
  }
  return rows.filter(Boolean);
}

export function WorkflowBuilder({
  workflowId, initialGraph, canManage, publishedTemplates,
}: { workflowId: string; initialGraph: unknown; canManage: boolean; publishedTemplates: { key: string; channel: string; purpose: string; locale: string }[] }) {
  const router = useRouter();
  const [graph, setGraph] = useState<Graph>(initialGraph as Graph);
  const [selected, setSelected] = useState<string | null>(null);
  const [configText, setConfigText] = useState("");
  const [configErr, setConfigErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [simRef, setSimRef] = useState("");
  const [sim, setSim] = useState<{ nodeId: string; type: string; outcome: string }[] | null>(null);
  const [dirty, setDirty] = useState(false);

  const validation = useMemo(() => validateGraph(graph), [graph]);
  const issuesByNode = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!validation.ok) for (const i of validation.issues) if (i.nodeId) m.set(i.nodeId, [...(m.get(i.nodeId) ?? []), i.message]);
    return m;
  }, [validation]);
  const node = graph.nodes.find((n) => n.id === selected) ?? null;

  const update = (g: Graph) => {
    setGraph(g);
    setDirty(true);
    setSim(null);
  };
  const select = (id: string) => {
    setSelected(id);
    const n = graph.nodes.find((x) => x.id === id);
    setConfigText(JSON.stringify(n?.config ?? {}, null, 2));
    setConfigErr(null);
  };
  const addNode = (type: string) => {
    let i = 1;
    while (graph.nodes.some((n) => n.id === `${type}_${i}`)) i++;
    const id = `${type}_${i}`;
    update({ ...graph, nodes: [...graph.nodes, { id, type, config: structuredClone(DEFAULTS[type]) }] });
    setSelected(id);
    setConfigText(JSON.stringify(DEFAULTS[type], null, 2));
  };
  const removeNode = (id: string) => {
    update({ ...graph, nodes: graph.nodes.filter((n) => n.id !== id), edges: graph.edges.filter((e) => e.from !== id && e.to !== id) });
    setSelected(null);
  };
  const setEdge = (from: string, to: string, branch?: "true" | "false") => {
    const others = graph.edges.filter((e) => !(e.from === from && (branch ? e.branch === branch : !e.branch)));
    update({ ...graph, edges: to ? [...others, { from, to, ...(branch ? { branch } : {}) }] : others });
  };
  const applyConfig = () => {
    try {
      const config = JSON.parse(configText);
      update({ ...graph, nodes: graph.nodes.map((n) => (n.id === selected ? { ...n, config } : n)) });
      setConfigErr(null);
    } catch {
      setConfigErr("Config is not valid JSON.");
    }
  };

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ tone: "ok", text: await fn() });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "err", text: `${label}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }
  const save = () => run("Save", async () => {
    await callApi("PATCH", `/api/admin/automation/workflows/${workflowId}`, { graph });
    setDirty(false);
    return "Draft saved. Running enrollments are not affected until you publish.";
  });

  const target = (from: string, branch?: "true" | "false") => graph.edges.find((e) => e.from === from && (branch ? e.branch === branch : !e.branch))?.to ?? "";
  const nodeOptions = (exclude: string) => graph.nodes.filter((n) => n.id !== exclude && n.type !== "trigger");

  return (
    <section className="rounded-xl border border-forest/10 bg-white p-4" aria-label="Workflow builder">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-lg border border-forest/20 p-0.5">
          {(["visual", "json"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); if (t === "json") setJsonText(JSON.stringify(graph, null, 2)); }} className={`rounded-md px-3 py-1 ${tab === t ? "bg-forest text-ivory" : ""}`}>{t === "visual" ? "Builder" : "JSON"}</button>
          ))}
        </div>
        {canManage && tab === "visual" && (
          <>
            <span className="ml-2 text-xs text-muted">Add:</span>
            {["condition", "delay", "action", "exit"].map((t) => <button key={t} onClick={() => addNode(t)} className="rounded-lg border border-forest/20 px-2.5 py-1 text-xs hover:bg-sage-50">+ {t}</button>)}
          </>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {canManage && <button disabled={busy} onClick={save} className="rounded-lg border border-forest/25 px-3 py-1.5 disabled:opacity-50">{dirty ? "Save draft*" : "Save draft"}</button>}
          <button disabled={busy} onClick={() => run("Validate", async () => {
            if (dirty && canManage) await callApi("PATCH", `/api/admin/automation/workflows/${workflowId}`, { graph });
            const r = (await callApi("POST", `/api/admin/automation/workflows/${workflowId}/validate`)) as { ok: boolean; issues?: { message: string }[] };
            if (!r.ok) throw new Error(r.issues!.map((i) => i.message).join(" "));
            return "Ready to publish: structure valid and all templates are published.";
          })} className="rounded-lg border border-forest/25 px-3 py-1.5 disabled:opacity-50">Validate</button>
          {canManage && (
            <button disabled={busy || !validation.ok} onClick={() => {
              if (!window.confirm("Publish this draft as a new immutable version and activate it? New events will use it; running enrollments keep their version.")) return;
              run("Publish", async () => {
                await callApi("PATCH", `/api/admin/automation/workflows/${workflowId}`, { graph });
                const r = (await callApi("POST", `/api/admin/automation/workflows/${workflowId}/publish`)) as { version: number };
                setDirty(false);
                return `Published v${r.version} and activated.`;
              });
            }} className="rounded-lg bg-forest px-3 py-1.5 text-ivory disabled:opacity-50">Publish</button>
          )}
        </span>
      </div>

      {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={`mb-3 rounded-lg px-3 py-2 text-xs ${msg.tone === "err" ? "bg-danger/10 text-danger" : "bg-forest/10 text-forest"}`}>{msg.text}</p>}
      <p className={`mb-3 text-xs ${validation.ok ? "text-forest" : "text-danger"}`}>
        {validation.ok ? "✓ Graph structure is valid." : `✗ ${validation.issues.length} issue(s): ${validation.issues.slice(0, 4).map((i) => (i.nodeId ? `[${i.nodeId}] ` : "") + i.message).join(" · ")}`}
      </p>

      {tab === "json" ? (
        <div>
          <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={24} spellCheck={false} className={`${inputCls} w-full font-mono text-xs`} aria-label="Workflow JSON" readOnly={!canManage} />
          {canManage && <button className="mt-2 rounded-lg border border-forest/25 px-3 py-1.5" onClick={() => { try { update(JSON.parse(jsonText)); setMsg({ tone: "ok", text: "JSON applied to the builder (not yet saved)." }); } catch { setMsg({ tone: "err", text: "Invalid JSON." }); } }}>Apply JSON</button>}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="overflow-x-auto rounded-lg bg-[#f4f4ef] p-3">
            {layers(graph).map((row, i) => (
              <div key={i}>
                {i > 0 && <div aria-hidden className="mx-auto h-4 w-px bg-forest/30" />}
                <div className="flex justify-center gap-3">
                  {row.map((n) => {
                    const outs = graph.edges.filter((e) => e.from === n.id);
                    const issues = issuesByNode.get(n.id);
                    const simStep = sim?.find((s) => s.nodeId === n.id);
                    return (
                      <button
                        key={n.id}
                        onClick={() => select(n.id)}
                        aria-pressed={selected === n.id}
                        className={`w-52 shrink-0 rounded-lg border-2 p-2 text-left text-xs transition ${TYPE_STYLE[n.type] ?? ""} ${selected === n.id ? "ring-2 ring-gold" : ""} ${issues ? "!border-danger" : ""} ${sim && !simStep ? "opacity-40" : ""}`}
                      >
                        <span className="flex justify-between"><span className="font-semibold uppercase tracking-wide">{n.type}</span><span className="opacity-70">{n.id}</span></span>
                        <span className="mt-1 block leading-snug">{n.label ?? summary(n)}</span>
                        {outs.length > 0 && <span className="mt-1 block opacity-70">{outs.map((e) => `${e.branch ? `${e.branch === "true" ? "yes" : "no"} → ` : "→ "}${e.to}`).join("  ")}</span>}
                        {simStep && <span className="mt-1 block rounded bg-white/80 px-1 text-forest">▶ {simStep.outcome}</span>}
                        {issues && <span className="mt-1 block text-danger">{issues[0]}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <aside className="space-y-3">
            {node ? (
              <div className="rounded-lg border border-forest/15 p-3">
                <div className="flex items-center justify-between"><h3 className="font-semibold">{node.type} · {node.id}</h3>{canManage && node.type !== "trigger" && <button onClick={() => removeNode(node.id)} className="text-xs text-danger underline">Delete</button>}</div>
                <label className="mt-2 block text-xs text-muted">Label<input value={node.label ?? ""} disabled={!canManage} onChange={(e) => update({ ...graph, nodes: graph.nodes.map((n) => (n.id === node.id ? { ...n, label: e.target.value || undefined } : n)) })} className={`${inputCls} block w-full`} /></label>
                {node.type === "trigger" ? (
                  <fieldset className="mt-2 text-xs"><legend className="text-muted">Trigger events</legend>
                    <div className="mt-1 max-h-40 overflow-y-auto">
                      {AUTOMATION_EVENT_TYPES.map((ev) => (
                        <label key={ev} className="flex items-center gap-1.5">
                          <input type="checkbox" disabled={!canManage} checked={((node.config.events as string[]) ?? []).includes(ev)} onChange={(e) => {
                            const cur = (node.config.events as string[]) ?? [];
                            const events = e.target.checked ? [...cur, ev] : cur.filter((x) => x !== ev);
                            update({ ...graph, nodes: graph.nodes.map((n) => (n.id === node.id ? { ...n, config: { ...n.config, events } } : n)) });
                          }} />{ev}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <label className="mt-2 block text-xs text-muted">Config (JSON)
                    <textarea value={configText} onChange={(e) => setConfigText(e.target.value)} onBlur={applyConfig} rows={7} spellCheck={false} disabled={!canManage} className={`${inputCls} block w-full font-mono text-[11px]`} />
                    {configErr && <span role="alert" className="text-danger">{configErr}</span>}
                  </label>
                )}
                {node.type !== "exit" && (
                  <div className="mt-2 space-y-1 text-xs">
                    {(node.type === "condition" ? (["true", "false"] as const) : [undefined]).map((b) => (
                      <label key={b ?? "next"} className="block text-muted">{b ? (b === "true" ? "If yes, go to" : "If no, go to") : "Then go to"}
                        <select value={target(node.id, b)} disabled={!canManage} onChange={(e) => setEdge(node.id, e.target.value, b)} className={`${inputCls} block w-full`}>
                          <option value="">— (end)</option>
                          {nodeOptions(node.id).map((n) => <option key={n.id} value={n.id}>{n.id} · {n.type}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : <p className="text-xs text-muted">Select a node to edit its settings and connections.</p>}

            <div className="rounded-lg border border-forest/15 p-3 text-xs">
              <h3 className="font-semibold">Stop & goal rules</h3>
              <p className="mt-1 text-muted">Stop an active run when one of these happens for the lead:</p>
              <div className="mt-1 max-h-32 overflow-y-auto">
                {AUTOMATION_EVENT_TYPES.map((ev) => (
                  <label key={ev} className="flex items-center gap-1.5">
                    <input type="checkbox" disabled={!canManage} checked={graph.settings.stopOn.includes(ev)} onChange={(e) => update({ ...graph, settings: { ...graph.settings, stopOn: e.target.checked ? [...graph.settings.stopOn, ev] : graph.settings.stopOn.filter((x) => x !== ev) } })} />{ev}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-muted">Goal reached (completes the run) when the lead moves to:</p>
              <div className="flex flex-wrap gap-x-3">
                {STATUSES.map((s) => (
                  <label key={s} className="flex items-center gap-1"><input type="checkbox" disabled={!canManage} checked={graph.settings.goalStatuses.includes(s)} onChange={(e) => update({ ...graph, settings: { ...graph.settings, goalStatuses: e.target.checked ? [...graph.settings.goalStatuses, s] : graph.settings.goalStatuses.filter((x) => x !== s) } })} />{s.toLowerCase().replace(/_/g, " ")}</label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-forest/15 p-3 text-xs">
              <h3 className="font-semibold">Dry run</h3>
              <p className="mt-1 text-muted">Walk the saved draft against a real lead. Nothing is sent or written.</p>
              <div className="mt-2 flex gap-2">
                <input value={simRef} onChange={(e) => setSimRef(e.target.value)} placeholder="Lead reference DF-…" className={`${inputCls} min-w-0 flex-1`} aria-label="Lead reference" />
                <button disabled={busy || !simRef} className="rounded-lg border border-forest/25 px-2" onClick={() => run("Simulate", async () => {
                  if (dirty && canManage) await callApi("PATCH", `/api/admin/automation/workflows/${workflowId}`, { graph });
                  const r = (await callApi("POST", `/api/admin/automation/workflows/${workflowId}/simulate`, { leadReference: simRef })) as { ok: boolean; path?: { nodeId: string; type: string; outcome: string }[]; issues?: { message: string }[] };
                  if (!r.ok) throw new Error(r.issues?.map((i) => i.message).join(" ") ?? "Invalid graph");
                  setSim(r.path!);
                  return `Simulated path: ${r.path!.map((p) => p.nodeId).join(" → ")}`;
                })}>Run</button>
              </div>
            </div>

            <div className="rounded-lg border border-forest/15 p-3 text-xs">
              <h3 className="font-semibold">Published templates</h3>
              <p className="text-muted">{publishedTemplates.length ? publishedTemplates.map((t) => `${t.key} (${t.channel.toLowerCase()}/${t.locale}, ${t.purpose.toLowerCase()})`).join(", ") : "None yet — publish templates under Campaigns › Templates before publishing a sending workflow."}</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

