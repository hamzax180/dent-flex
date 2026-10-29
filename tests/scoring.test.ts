import { describe, expect, it } from "vitest";
import { calculateScore, bandFor, SCORE_WEIGHTS, type ScoreFacts } from "@/lib/scoring";
import { scoreFactsFromLead } from "@/lib/services/leads";

const empty: ScoreFacts = {
  appointmentIntent: false, bookingTimeframe: null, hasValidEmail: false, hasValidPhone: false, hasTreatmentInterest: false,
  preferredChannel: null, preferredTime: null, answeredFollowUp: false, nextStepRequested: null,
};
const full: ScoreFacts = {
  appointmentIntent: true, bookingTimeframe: "next week", hasValidEmail: true, hasValidPhone: false, hasTreatmentInterest: true,
  preferredChannel: "PHONE", preferredTime: null, answeredFollowUp: true, nextStepRequested: "CALLBACK",
};

describe("conversion-readiness score", () => {
  it("weights sum to 100 and every factor is explained", () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const r = calculateScore(full);
    expect(r.total).toBe(100);
    expect(r.factors).toHaveLength(7);
    for (const f of r.factors) expect(f.reason.length).toBeGreaterThan(5);
  });

  it("scores missing information as zero for that factor only", () => {
    expect(calculateScore(empty).total).toBe(0);
    expect(calculateScore({ ...empty, hasValidPhone: true }).total).toBe(15);
    expect(calculateScore({ ...empty, appointmentIntent: true, bookingTimeframe: "  " }).total).toBe(25);
  });

  it("uses the configured bands", () => {
    expect(bandFor(100)).toBe("HOT");
    expect(bandFor(75)).toBe("HOT");
    expect(bandFor(74)).toBe("WARM");
    expect(bandFor(40)).toBe("WARM");
    expect(bandFor(39)).toBe("LOW_INFORMATION");
    expect(bandFor(0)).toBe("LOW_INFORMATION");
  });

  it("is deterministic", () => {
    expect(calculateScore(full)).toEqual(calculateScore(full));
  });

  it("ignores name, language, nationality-like and free-text fields entirely", () => {
    const base = {
      appointmentIntent: true, bookingTimeframe: "soon", email: "a@b.co", phone: null, treatmentId: "x", treatmentNotSure: false,
      preferredChannel: null, preferredTime: null, answeredFollowUp: false, nextStepRequested: null,
    } as const;
    // Extra lead attributes are not even read by the facts mapper.
    const a = scoreFactsFromLead({ ...base, ...({ fullName: "Ahmet Yılmaz", language: "tr", utmSource: "x" } as object) } as never);
    const b = scoreFactsFromLead({ ...base, ...({ fullName: "John Smith", language: "en", utmSource: "y" } as object) } as never);
    expect(calculateScore(a)).toEqual(calculateScore(b));
  });

  it("does not count 'not sure' as a treatment interest", () => {
    const facts = scoreFactsFromLead({
      appointmentIntent: false, bookingTimeframe: null, email: null, phone: null, treatmentId: "x", treatmentNotSure: true,
      preferredChannel: null, preferredTime: null, answeredFollowUp: false, nextStepRequested: null,
    });
    expect(facts.hasTreatmentInterest).toBe(false);
  });
});
