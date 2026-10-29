import { z } from "zod";
import { zonedToUtc } from "../automation/time";
import { clinicTimezone } from "../settings";

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * Accepts an ISO instant (with Z/offset) or a naive "YYYY-MM-DDTHH:mm" from a datetime-local
 * input. Naive values are interpreted in the CLINIC timezone — not the browser's — so a
 * receptionist working abroad or on a mis-set laptop still books the right slot.
 */
export const clinicDateTime = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const m = v.match(NAIVE);
  if (!m) return v;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  return zonedToUtc(y, mo, d, h, mi, clinicTimezone());
}, z.coerce.date());
