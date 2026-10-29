import { z } from "zod";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { audit } from "../audit";
import type { Staff } from "../auth/session";
import type { Permission } from "../auth/rbac";

// Website content editable from the CRM. Anything shown publicly passes through here.

const text = (max: number) => z.string().trim().min(1).max(max);
const order = z.coerce.number().int().min(0).max(999).default(0);

const treatment = z.object({
  nameEn: text(80), nameTr: text(80),
  summaryEn: text(1200), summaryTr: text(1200),
  active: z.boolean().default(true),
  approved: z.boolean().default(false),
  sortOrder: order,
});
const faq = z.object({
  questionEn: text(200), answerEn: text(2000),
  questionTr: text(200), answerTr: text(2000),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  sortOrder: order,
});
const list = z.array(z.string().trim().min(1).max(60)).max(12).default([]);
const team = z.object({
  name: text(120), title: text(160), bio: text(2000),
  credentials: z.string().trim().max(300).default(""),
  languages: list,
  specialties: list,
  photoUrl: z.union([z.string().url().max(500), z.literal("")]).optional().transform((v) => v || null),
  isPlaceholder: z.boolean().default(false),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  sortOrder: order,
});

const review = z
  .object({
    author: text(60), country: z.string().trim().max(60).default(""), treatment: z.string().trim().max(80).default(""),
    quote: text(1200), rating: z.coerce.number().int().min(1).max(5).default(5),
    source: z.enum(["GOOGLE", "TRUSTPILOT", "CLINIC"]).default("CLINIC"),
    sourceUrl: z.union([z.string().url().max(500), z.literal("")]).optional().transform((v) => v || null),
    consent: z.boolean().default(false),
    status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
    sortOrder: order,
  })
  .refine((r) => r.status === "DRAFT" || r.consent, { message: "Only publish a review once the patient has given permission.", path: ["consent"] })
  .transform(({ consent, ...r }) => ({ ...r, consentAt: consent ? new Date() : null }));

export const CONTENT = {
  treatments: { schema: treatment, perm: "treatments:manage" as Permission, deletable: false },
  faqs: { schema: faq, perm: "settings:manage" as Permission, deletable: true },
  team: { schema: team, perm: "settings:manage" as Permission, deletable: true },
  reviews: { schema: review, perm: "settings:manage" as Permission, deletable: true },
} as const;
export type ContentKind = keyof typeof CONTENT;

export function contentKind(kind: string): ContentKind {
  if (!(kind in CONTENT)) throw new ApiError("NOT_FOUND", "Unknown content type.");
  return kind as ContentKind;
}

export async function createContent(kind: ContentKind, raw: unknown, staff: Staff, requestId?: string) {
  let row: { id: string };
  if (kind === "treatments") {
    const { slug } = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "Use lowercase letters, numbers and dashes, e.g. root-canal") }).parse(raw);
    const data = treatment.parse(raw);
    if (await prisma.treatment.findUnique({ where: { slug } })) throw new ApiError("CONFLICT", "A treatment with that URL name already exists.", { slug: "Already used" });
    row = await prisma.treatment.create({ data: { slug, ...data } });
  } else if (kind === "faqs") {
    row = await prisma.faq.create({ data: faq.parse(raw) });
  } else if (kind === "reviews") {
    row = await prisma.testimonial.create({ data: review.parse(raw) });
  } else {
    row = await prisma.teamMember.create({ data: team.parse(raw) });
  }
  await audit(prisma, { actorId: staff.id, action: `content.${kind}.created`, entityType: kind, entityId: row.id, requestId });
  return row;
}

export async function updateContent(kind: ContentKind, id: string, raw: unknown, staff: Staff, requestId?: string) {
  const data = CONTENT[kind].schema.parse(raw);
  if (kind === "treatments") await prisma.treatment.update({ where: { id }, data: data as z.infer<typeof treatment> });
  else if (kind === "faqs") await prisma.faq.update({ where: { id }, data: data as z.infer<typeof faq> });
  else if (kind === "reviews") await prisma.testimonial.update({ where: { id }, data: data as z.infer<typeof review> });
  else await prisma.teamMember.update({ where: { id }, data: data as z.infer<typeof team> });
  await audit(prisma, { actorId: staff.id, action: `content.${kind}.updated`, entityType: kind, entityId: id, requestId });
}

export async function deleteContent(kind: ContentKind, id: string, staff: Staff, requestId?: string) {
  if (!CONTENT[kind].deletable) throw new ApiError("VALIDATION_ERROR", "Treatments can't be deleted (leads and prices refer to them). Hide it instead.");
  if (kind === "faqs") await prisma.faq.delete({ where: { id } });
  else if (kind === "reviews") await prisma.testimonial.delete({ where: { id } });
  else await prisma.teamMember.delete({ where: { id } });
  await audit(prisma, { actorId: staff.id, action: `content.${kind}.deleted`, entityType: kind, entityId: id, requestId });
}
