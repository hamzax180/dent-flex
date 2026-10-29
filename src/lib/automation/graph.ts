import { z } from "zod";
import { AUTOMATION_EVENT_TYPES } from "../jobs";

// Workflow = validated directed acyclic graph of typed nodes.

const eventEnum = z.enum(AUTOMATION_EVENT_TYPES as [string, ...string[]]);
const channel = z.enum(["EMAIL", "WHATSAPP"]);
const purpose = z.enum(["SERVICE", "MARKETING"]);
const leadStatus = z.enum(["NEW", "CONTACTED", "QUALIFIED", "APPOINTMENT_REQUESTED", "APPOINTMENT_CONFIRMED", "VISITED", "TREATMENT_PROPOSED", "WON", "LOST", "NURTURE"]);
/** Statuses an automation may set. Confirmation/visit/won states need a human. */
export const AUTOMATION_SETTABLE_STATUSES = ["CONTACTED", "NURTURE"] as const;

export const triggerConfig = z.object({
  events: z.array(eventEnum).min(1),
  filters: z
    .object({
      sources: z.array(z.string()).optional(),
      scoreBands: z.array(z.enum(["HOT", "WARM", "LOW_INFORMATION"])).optional(),
      toStatuses: z.array(leadStatus).optional(),
    })
    .optional(),
});

export const conditionConfig = z.discriminatedUnion("check", [
  z.object({ check: z.literal("has_permission"), channel, purpose }),
  z.object({ check: z.literal("lead_status_in"), statuses: z.array(leadStatus).min(1) }),
  z.object({ check: z.literal("score_band_in"), bands: z.array(z.enum(["HOT", "WARM", "LOW_INFORMATION"])).min(1) }),
  z.object({ check: z.literal("has_tag"), tag: z.string().min(1).max(40) }),
  z.object({ check: z.literal("language_is"), language: z.enum(["en", "tr"]) }),
  z.object({ check: z.literal("source_in"), sources: z.array(z.string()).min(1) }),
  z.object({ check: z.literal("owner_assigned") }),
  z.object({ check: z.literal("contact_valid"), channel }),
  z.object({ check: z.literal("appointment_status_is"), status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]) }),
  z.object({ check: z.literal("replied_since_enrollment") }),
  z.object({ check: z.literal("human_responded") }),
]);

export const delayConfig = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("duration"), minutes: z.number().int().min(1).max(60 * 24 * 90) }),
  z.object({ mode: z.literal("before_appointment"), minutes: z.number().int().min(5).max(60 * 24 * 14) }),
  z.object({ mode: z.literal("clinic_time"), afterDays: z.number().int().min(0).max(90), time: z.string().regex(/^\d{2}:\d{2}$/) }),
]);

export const actionConfig = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send_message"), channel, purpose, templateKey: z.string().min(1).max(80) }),
  z.object({ action: z.literal("create_task"), title: z.string().min(1).max(160), dueInMinutes: z.number().int().min(0).max(60 * 24 * 30), assignTo: z.enum(["owner", "unassigned"]) }),
  z.object({ action: z.literal("add_tag"), tag: z.string().min(1).max(40) }),
  z.object({ action: z.literal("remove_tag"), tag: z.string().min(1).max(40) }),
  z.object({ action: z.literal("set_status"), status: z.enum(AUTOMATION_SETTABLE_STATUSES) }),
  z.object({ action: z.literal("notify_staff"), message: z.string().min(1).max(300) }),
  z.object({ action: z.literal("webhook"), url: z.string().url() }),
  z.object({ action: z.literal("mark_goal") }),
]);

const base = { id: z.string().regex(/^[a-z0-9_-]{1,40}$/i), label: z.string().max(80).optional() };
export const nodeSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("trigger"), config: triggerConfig }),
  z.object({ ...base, type: z.literal("condition"), config: conditionConfig }),
  z.object({ ...base, type: z.literal("delay"), config: delayConfig }),
  z.object({ ...base, type: z.literal("action"), config: actionConfig }),
  z.object({ ...base, type: z.literal("exit"), config: z.object({ reason: z.string().max(120) }) }),
]);

export const graphSchema = z.object({
  nodes: z.array(nodeSchema).min(2).max(60),
  edges: z.array(z.object({ from: z.string(), to: z.string(), branch: z.enum(["true", "false"]).optional() })).max(120),
  settings: z.object({
    /** Events that stop an active enrollment for the same lead. */
    stopOn: z.array(eventEnum).default([]),
    /** Lead statuses that count as the workflow goal (also stops the run). */
    goalStatuses: z.array(leadStatus).default([]),
    allowReenrollment: z.boolean().default(false),
  }),
});

export type WorkflowGraph = z.infer<typeof graphSchema>;
export type WorkflowNode = WorkflowGraph["nodes"][number];

export type GraphIssue = { nodeId?: string; message: string };

/** Structural validation beyond the schema: single trigger, edges, branches, reachability, acyclicity. */
export function validateGraph(raw: unknown): { ok: true; graph: WorkflowGraph } | { ok: false; issues: GraphIssue[] } {
  const parsed = graphSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ message: `${i.path.join(".")}: ${i.message}` })) };
  }
  const g = parsed.data;
  const issues: GraphIssue[] = [];
  const ids = new Set<string>();
  for (const n of g.nodes) {
    if (ids.has(n.id)) issues.push({ nodeId: n.id, message: "Duplicate node id." });
    ids.add(n.id);
  }
  const triggers = g.nodes.filter((n) => n.type === "trigger");
  if (triggers.length !== 1) issues.push({ message: "A workflow needs exactly one trigger node." });

  const out = new Map<string, typeof g.edges>();
  const indeg = new Map<string, number>();
  for (const e of g.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) {
      issues.push({ message: `Edge ${e.from} → ${e.to} references an unknown node.` });
      continue;
    }
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  for (const n of g.nodes) {
    const edges = out.get(n.id) ?? [];
    if (n.type === "condition") {
      const branches = edges.map((e) => e.branch).sort().join(",");
      if (branches !== "false,true") issues.push({ nodeId: n.id, message: "A condition needs exactly one 'true' and one 'false' branch." });
    } else {
      if (edges.some((e) => e.branch)) issues.push({ nodeId: n.id, message: "Only condition nodes can have branches." });
      if (edges.length > 1) issues.push({ nodeId: n.id, message: "Non-condition nodes can have at most one outgoing edge." });
    }
    if (n.type === "exit" && edges.length) issues.push({ nodeId: n.id, message: "Exit nodes cannot have outgoing edges." });
    if (n.type === "trigger" && indeg.get(n.id)) issues.push({ nodeId: n.id, message: "Nothing may point back to the trigger." });
  }
  const trigger = triggers[0];
  if (trigger) {
    // Reachability + cycle detection (DFS with colours).
    const colour = new Map<string, 1 | 2>();
    const visit = (id: string): boolean => {
      if (colour.get(id) === 1) return false;
      if (colour.get(id) === 2) return true;
      colour.set(id, 1);
      for (const e of out.get(id) ?? []) if (!visit(e.to)) return false;
      colour.set(id, 2);
      return true;
    };
    if (!visit(trigger.id)) issues.push({ message: "The workflow contains a loop. Workflows must be acyclic." });
    for (const n of g.nodes) if (!colour.has(n.id)) issues.push({ nodeId: n.id, message: "Node is not reachable from the trigger." });

    const apptTrigger = trigger.type === "trigger" && trigger.config.events.every((e) => e.startsWith("appointment.") && e !== "appointment.requested");
    for (const n of g.nodes) {
      if (n.type === "delay" && n.config.mode === "before_appointment" && !apptTrigger) {
        issues.push({ nodeId: n.id, message: "'Before appointment' delays need a confirmed/rescheduled appointment trigger." });
      }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, graph: g };
}

export function nextNodes(g: WorkflowGraph, nodeId: string, branch?: boolean): string[] {
  return g.edges
    .filter((e) => e.from === nodeId && (branch === undefined || e.branch === String(branch)))
    .map((e) => e.to);
}

export function templateKeysUsed(g: WorkflowGraph) {
  return g.nodes.flatMap((n) => (n.type === "action" && n.config.action === "send_message" ? [{ key: n.config.templateKey, channel: n.config.channel, purpose: n.config.purpose }] : []));
}
