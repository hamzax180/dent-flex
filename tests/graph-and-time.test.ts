import { describe, expect, it } from "vitest";
import { validateGraph } from "@/lib/automation/graph";
import { WORKFLOW_TEMPLATES } from "@/lib/automation/templates";
import { zonedToUtc, clinicTimeAfter, inQuietHours, nextAllowedSendTime } from "@/lib/automation/time";

const settings = { stopOn: [], goalStatuses: [], allowReenrollment: false };
const trig = { id: "t", type: "trigger", config: { events: ["lead.created"] } };
const exit = (id: string) => ({ id, type: "exit", config: { reason: id } });

describe("workflow graph validation", () => {
  it("accepts every prebuilt template", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      const v = validateGraph(t.graph);
      expect(v.ok, `${t.key}: ${JSON.stringify(!v.ok && v.issues)}`).toBe(true);
    }
  });

  it("rejects a condition with a missing branch", () => {
    const v = validateGraph({
      nodes: [trig, { id: "c", type: "condition", config: { check: "owner_assigned" } }, exit("a")],
      edges: [{ from: "t", to: "c" }, { from: "c", to: "a", branch: "true" }],
      settings,
    });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.issues.some((i) => i.message.includes("'true' and one 'false'"))).toBe(true);
  });

  it("rejects cycles, unreachable nodes, and multiple triggers", () => {
    const delay = (id: string) => ({ id, type: "delay", config: { mode: "duration", minutes: 5 } });
    const cyc = validateGraph({ nodes: [trig, delay("a"), delay("b")], edges: [{ from: "t", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "a" }], settings });
    expect(!cyc.ok && cyc.issues.some((i) => i.message.includes("loop"))).toBe(true);
    const unreachable = validateGraph({ nodes: [trig, exit("a"), exit("orphan")], edges: [{ from: "t", to: "a" }], settings });
    expect(!unreachable.ok && unreachable.issues.some((i) => i.nodeId === "orphan")).toBe(true);
    const two = validateGraph({ nodes: [trig, { ...trig, id: "t2" }, exit("a")], edges: [{ from: "t", to: "a" }, { from: "t2", to: "a" }], settings });
    expect(two.ok).toBe(false);
  });

  it("rejects 'before appointment' delays on non-appointment triggers", () => {
    const v = validateGraph({
      nodes: [trig, { id: "d", type: "delay", config: { mode: "before_appointment", minutes: 60 } }, exit("a")],
      edges: [{ from: "t", to: "d" }, { from: "d", to: "a" }],
      settings,
    });
    expect(v.ok).toBe(false);
  });

  it("only allows automation to set safe statuses", () => {
    const v = validateGraph({
      nodes: [trig, { id: "s", type: "action", config: { action: "set_status", status: "APPOINTMENT_CONFIRMED" } }, exit("a")],
      edges: [{ from: "t", to: "s" }, { from: "s", to: "a" }],
      settings,
    });
    expect(v.ok).toBe(false);
  });
});

describe("clinic time and DST", () => {
  it("converts Istanbul local time (UTC+3, no DST)", () => {
    expect(zonedToUtc(2026, 7, 1, 9, 0, "Europe/Istanbul").toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(zonedToUtc(2026, 1, 1, 9, 0, "Europe/Istanbul").toISOString()).toBe("2026-01-01T06:00:00.000Z");
  });

  it("handles DST transitions for a DST zone", () => {
    // New York: EDT (UTC-4) before 1 Nov 2026, EST (UTC-5) after.
    expect(zonedToUtc(2026, 10, 31, 10, 0, "America/New_York").toISOString()).toBe("2026-10-31T14:00:00.000Z");
    expect(zonedToUtc(2026, 11, 2, 10, 0, "America/New_York").toISOString()).toBe("2026-11-02T15:00:00.000Z");
    // "Next day at 10:00" across the fall-back night keeps local wall-clock time.
    const from = new Date("2026-10-31T20:00:00Z");
    expect(clinicTimeAfter(from, 1, "10:00", "America/New_York").toISOString()).toBe("2026-11-01T15:00:00.000Z");
    // Spring-forward: 02:30 does not exist on 8 Mar 2026, shifted forward to 03:30 EDT.
    expect(zonedToUtc(2026, 3, 8, 2, 30, "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("computes quiet hours across midnight", () => {
    const tz = "Europe/Istanbul";
    expect(inQuietHours(new Date("2026-07-01T18:30:00Z"), "20:00", "09:00", tz)).toBe(true); // 21:30 local
    expect(inQuietHours(new Date("2026-07-01T04:00:00Z"), "20:00", "09:00", tz)).toBe(true); // 07:00 local
    expect(inQuietHours(new Date("2026-07-01T09:00:00Z"), "20:00", "09:00", tz)).toBe(false); // 12:00 local
    expect(nextAllowedSendTime(new Date("2026-07-01T18:30:00Z"), "20:00", "09:00", tz).toISOString()).toBe("2026-07-02T06:00:00.000Z");
    expect(nextAllowedSendTime(new Date("2026-07-01T04:00:00Z"), "20:00", "09:00", tz).toISOString()).toBe("2026-07-01T06:00:00.000Z");
  });
});
