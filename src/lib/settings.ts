import { z } from "zod";
import { prisma, type Db } from "./db";

// Every clinic fact is editable and starts as a clearly-labelled placeholder.
// Nothing here may be presented as real until an admin replaces it.

export const clinicInfoSchema = z.object({
  name: z.string().min(1).max(120),
  isPlaceholder: z.boolean(),
  addressLines: z.array(z.string().max(200)).max(5),
  city: z.string().max(80),
  phone: z.string().max(40),
  whatsapp: z.string().max(40),
  email: z.string().max(254),
  mapUrl: z.string().max(500),
  emergencyText: z.string().max(600),
  hours: z.array(z.object({ day: z.string().max(20), open: z.string().max(20), close: z.string().max(20) })).max(7),
});
export type ClinicInfo = z.infer<typeof clinicInfoSchema>;

export const automationGovernanceSchema = z.object({
  globalPause: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  marketingCapPerWeek: z.number().int().min(0).max(14),
  messageExpiryHours: z.number().int().min(1).max(720),
  webhookAllowlist: z.array(z.string().url()).max(20),
});
export type AutomationGovernance = z.infer<typeof automationGovernanceSchema>;

/** What the AI coordinator may say about the clinic. Every point must be true and approved. */
export const salesProfileSchema = z.object({
  assistantName: z.string().min(1).max(40),
  voiceGender: z.enum(["female", "male", "any"]),
  sellingPoints: z
    .array(z.object({ title: z.string().min(2).max(80), detail: z.string().min(2).max(400) }))
    .max(12),
  /** Services the clinic actually provides around treatment (e.g. airport transfer). Empty until confirmed. */
  includedServices: z.array(z.string().min(2).max(160)).max(15),
  comparisonMarkets: z.array(z.string().regex(/^[A-Z]{2}$/)).max(8),
});
export type SalesProfile = z.infer<typeof salesProfileSchema>;

export const privacySettingsSchema = z.object({
  storeTranscripts: z.boolean(), // only after a reviewed retention purpose
  transcriptRetentionDays: z.number().int().min(1).max(3650),
  noticeVersion: z.string().max(40),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

export const DEFAULTS = {
  clinic_info: {
    name: "Dent Flex",
    isPlaceholder: true,
    addressLines: ["[Placeholder address — replace in CRM › Settings]"],
    city: "Istanbul, Türkiye",
    phone: "[Clinic phone — not yet supplied]",
    whatsapp: "",
    email: "[Clinic email — not yet supplied]",
    mapUrl: "",
    emergencyText:
      "If you have severe pain, swelling that affects breathing or swallowing, heavy bleeding or facial trauma, call 112 or go to the nearest emergency department now.",
    hours: [
      { day: "Mon–Fri", open: "[hours tbc]", close: "" },
      { day: "Sat", open: "[hours tbc]", close: "" },
      { day: "Sun", open: "[hours tbc]", close: "" },
    ],
  } satisfies ClinicInfo,
  automation_governance: {
    globalPause: false,
    quietHoursStart: "20:00",
    quietHoursEnd: "09:00",
    marketingCapPerWeek: 2,
    messageExpiryHours: 48,
    webhookAllowlist: [],
  } satisfies AutomationGovernance,
  sales_profile: {
    assistantName: "Defne",
    voiceGender: "female",
    // Only process facts that are true of this system today. Add clinic-verified points in CRM › Settings.
    sellingPoints: [
      { title: "Transparent, published prices", detail: "Every price we show is approved by the clinic and lists what is included and excluded. No hidden extras are quoted by our assistant." },
      { title: "A written plan before you commit", detail: "After an examination the dentist explains your options in plain language and you receive a written plan to take home and consider." },
      { title: "English and Turkish", detail: "You can talk to our team and assistant in English or Turkish." },
      { title: "A real person follows up", detail: "Every request is followed up by a member of our reception team, who arranges your consultation with you." },
    ],
    includedServices: [],
    comparisonMarkets: ["GB", "US", "DE"],
  } satisfies SalesProfile,
  privacy: {
    storeTranscripts: false,
    transcriptRetentionDays: 30,
    noticeVersion: "draft-2026-10",
  } satisfies PrivacySettings,
};

const SCHEMAS = {
  clinic_info: clinicInfoSchema,
  automation_governance: automationGovernanceSchema,
  privacy: privacySettingsSchema,
  sales_profile: salesProfileSchema,
};
type Key = keyof typeof SCHEMAS;
type Value<K extends Key> = z.infer<(typeof SCHEMAS)[K]>;

export async function getSetting<K extends Key>(key: K, db: Db = prisma): Promise<Value<K>> {
  const row = await db.clinicSetting.findUnique({ where: { key } });
  const parsed = SCHEMAS[key].safeParse(row?.value);
  return (parsed.success ? parsed.data : DEFAULTS[key]) as Value<K>;
}

export function settingSchema(key: string) {
  return (SCHEMAS as Record<string, z.ZodTypeAny>)[key];
}

export function clinicTimezone(): string {
  return process.env.CLINIC_TIMEZONE || "Europe/Istanbul";
}
