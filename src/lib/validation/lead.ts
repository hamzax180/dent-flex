import { z } from "zod";

// Shared by the browser form and every server-side lead channel.

export const LANGUAGES = ["en", "tr"] as const;
export const CONTACT_CHANNELS = ["EMAIL", "PHONE", "WHATSAPP"] as const;
export const NEXT_STEPS = ["PRICE_INFO", "CONSULTATION_DETAILS", "CALLBACK"] as const;

/** Current privacy notice version shown on forms. Update when legal text changes. */
export const PRIVACY_NOTICE_VERSION = "draft-2026-10";

const trimmed = (max: number) => z.string().trim().max(max);

export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, "");
  return cleaned.startsWith("00") ? `+${cleaned.slice(2)}` : cleaned;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine((v) => /^\+?\d{7,15}$/.test(v), "Enter a valid phone number, including country code if outside Türkiye.");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export const leadInputSchema = z
  .object({
    fullName: trimmed(120).min(2, "Please enter your name."),
    email: z.union([emailSchema, z.literal("")]).optional(),
    phone: z.union([phoneSchema, z.literal("")]).optional(),
    language: z.enum(LANGUAGES).default("en"),
    treatmentSlug: trimmed(80).optional(), // "not-sure" allowed
    preferredChannel: z.enum(CONTACT_CHANNELS).optional(),
    preferredTime: trimmed(120).optional(),
    bookingTimeframe: trimmed(120).optional(),
    appointmentIntent: z.boolean().default(false),
    nextStepRequested: z.enum(NEXT_STEPS).optional(),
    preferredDate: trimmed(60).optional(),
    message: trimmed(1000).optional(),
    privacyNoticeAccepted: z.literal(true, {
      errorMap: () => ({ message: "Please confirm you have read the privacy notice." }),
    }),
    marketingOptIn: z.boolean().default(false),
    // Honeypot: real users never fill this.
    website: z.string().max(0, "Invalid submission.").optional(),
    utm: z
      .object({ source: trimmed(80).optional(), medium: trimmed(80).optional(), campaign: trimmed(80).optional() })
      .optional(),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.phone), {
    message: "Please give us a phone number or an email address.",
    path: ["phone"],
  });

export type LeadInput = z.input<typeof leadInputSchema>;
export type LeadInputParsed = z.output<typeof leadInputSchema>;
