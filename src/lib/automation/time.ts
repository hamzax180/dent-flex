// Clinic-local time helpers. Everything is stored in UTC; schedules are expressed in
// the clinic timezone and converted here (DST-safe via Intl, no fixed offsets).

function partsIn(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

/** Offset (ms) of `timeZone` from UTC at instant `date`. */
function offsetAt(date: Date, timeZone: string) {
  const p = partsIn(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convert a clinic-local wall-clock time to a UTC instant.
 * Ambiguous (fall-back) times resolve to the first occurrence; non-existent
 * (spring-forward) times shift forward by the size of the gap.
 */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = [offsetAt(new Date(guess - 86400_000), timeZone), offsetAt(new Date(guess + 86400_000), timeZone)];
  const matches = offsets
    .map((o) => guess - o)
    .filter((ts) => {
      const p = partsIn(new Date(ts), timeZone);
      return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute;
    })
    .sort((a, b) => a - b);
  return new Date(matches[0] ?? guess - Math.min(...offsets));
}

export function localParts(date: Date, timeZone: string) {
  return partsIn(date, timeZone);
}

/** `afterDays` days from `from` (clinic-local calendar), at local HH:MM. */
export function clinicTimeAfter(from: Date, afterDays: number, hhmm: string, timeZone: string): Date {
  const p = partsIn(from, timeZone);
  const [h, m] = hhmm.split(":").map(Number);
  const target = new Date(Date.UTC(p.year, p.month - 1, p.day + afterDays));
  let at = zonedToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), h, m, timeZone);
  if (at <= from) {
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day + afterDays + 1));
    at = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), h, m, timeZone);
  }
  return at;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** True if `at` falls inside quiet hours (window may cross midnight). */
export function inQuietHours(at: Date, start: string, end: string, timeZone: string): boolean {
  const p = partsIn(at, timeZone);
  const now = p.hour * 60 + p.minute;
  const s = toMin(start), e = toMin(end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** Earliest instant >= `at` outside quiet hours. */
export function nextAllowedSendTime(at: Date, start: string, end: string, timeZone: string): Date {
  if (!inQuietHours(at, start, end, timeZone)) return at;
  const p = partsIn(at, timeZone);
  const nowMin = p.hour * 60 + p.minute;
  const addDay = toMin(start) > toMin(end) && nowMin >= toMin(start) ? 1 : 0;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + addDay));
  const [h, m] = end.split(":").map(Number);
  return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m, timeZone);
}
