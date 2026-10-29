import { secret as envSecret } from "./env";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

// Crockford-style alphabet without ambiguous characters.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Random, non-sequential public reference, e.g. "DF-7KQ2-M9TX". */
export function publicId(prefix = "DF"): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${out.slice(0, 4)}-${out.slice(4)}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function secret(): string {
  const s = envSecret("APP_SECRET");
  if (!s || s.length < 16) throw new Error("APP_SECRET is not configured");
  return s;
}

export function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function verifySignature(value: string, sig: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
