import type { ScoreBand } from "@prisma/client";

/**
 * Conversion-readiness score: a deterministic, explainable workflow priority.
 * It is NOT patient worth, clinical urgency or eligibility for care.
 *
 * Inputs are deliberately limited to booking/contact facts. Name, nationality,
 * language, sex, disability, diagnosis, symptoms, income, consent status and
 * medical urgency are never passed in, so they cannot influence the result.
 */
export const SCORE_VERSION = "2026-10-v1";

export type ScoreFacts = {
  appointmentIntent: boolean;
  bookingTimeframe: string | null;
  hasValidEmail: boolean;
  hasValidPhone: boolean;
  hasTreatmentInterest: boolean; // specific treatment selected (not "not sure")
  preferredChannel: string | null;
  preferredTime: string | null;
  answeredFollowUp: boolean;
  nextStepRequested: string | null;
};

export type ScoreFactor = { key: string; label: string; points: number; max: number; reason: string };

export const SCORE_WEIGHTS = {
  appointment_intent: 25,
  booking_timeframe: 20,
  reachable_contact: 15,
  treatment_interest: 10,
  contact_preference: 10,
  answered_follow_up: 10,
  next_step: 10,
} as const;

export const BANDS: { band: ScoreBand; min: number; label: string }[] = [
  { band: "HOT", min: 75, label: "Hot" },
  { band: "WARM", min: 40, label: "Warm" },
  { band: "LOW_INFORMATION", min: 0, label: "Low information" },
];

export function bandFor(total: number): ScoreBand {
  return BANDS.find((b) => total >= b.min)!.band;
}

export function calculateScore(f: ScoreFacts): { total: number; band: ScoreBand; factors: ScoreFactor[]; version: string } {
  const W = SCORE_WEIGHTS;
  const factor = (key: keyof typeof W, label: string, hit: boolean, yes: string, no: string): ScoreFactor => ({
    key,
    label,
    max: W[key],
    points: hit ? W[key] : 0,
    reason: hit ? yes : no,
  });
  const factors: ScoreFactor[] = [
    factor("appointment_intent", "Explicit appointment intent", f.appointmentIntent,
      "Asked to book an appointment or consultation.", "No explicit appointment request yet."),
    factor("booking_timeframe", "Self-stated booking timeframe", Boolean(f.bookingTimeframe?.trim()),
      `Stated timeframe: "${f.bookingTimeframe?.trim() ?? ""}".`, "No booking timeframe given."),
    factor("reachable_contact", "Reachable contact method", f.hasValidEmail || f.hasValidPhone,
      "At least one valid phone or email.", "No valid contact method."),
    factor("treatment_interest", "Specific treatment interest", f.hasTreatmentInterest,
      "Selected a specific treatment.", "No specific treatment selected (or \"not sure\")."),
    factor("contact_preference", "Preferred time or channel", Boolean(f.preferredChannel || f.preferredTime?.trim()),
      "Gave a preferred contact channel or time.", "No contact preference given."),
    factor("answered_follow_up", "Answered a follow-up question", f.answeredFollowUp,
      "Responded to a booking/contact follow-up.", "Has not answered a follow-up yet."),
    factor("next_step", "Clear next step requested", Boolean(f.nextStepRequested),
      `Requested: ${f.nextStepRequested?.toLowerCase().replace(/_/g, " ") ?? ""}.`, "No specific next step requested."),
  ];
  const total = factors.reduce((s, x) => s + x.points, 0);
  return { total, band: bandFor(total), factors, version: SCORE_VERSION };
}

export const SCORE_EXPLAINER =
  "A low score means the inquiry is missing booking information — not that the person is a bad patient. " +
  "The score orders follow-up work only; it never decides eligibility for care or clinical priority.";
