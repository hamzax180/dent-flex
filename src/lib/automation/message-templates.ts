import { z } from "zod";
import { prisma } from "../db";
import { ApiError } from "../errors";
import { audit } from "../audit";
import type { Staff } from "../auth/session";

export const templateDraftSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,80}$/),
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  locale: z.enum(["en", "tr"]),
  purpose: z.enum(["SERVICE", "MARKETING"]),
  subject: z.string().trim().max(150).optional(),
  previewText: z.string().trim().max(150).optional(),
  body: z.string().trim().min(5).max(5000),
  providerTemplateName: z.string().trim().max(120).optional(),
});

/** Every edit is a new DRAFT version; published versions are never modified. */
export async function createTemplateVersion(staff: Staff, raw: unknown) {
  const t = templateDraftSchema.parse(raw);
  if (t.channel === "EMAIL" && !t.subject) throw new ApiError("VALIDATION_ERROR", "Email templates need a subject.", { subject: "Required" });
  if (t.channel === "WHATSAPP" && !t.providerTemplateName) {
    throw new ApiError("VALIDATION_ERROR", "WhatsApp templates need the provider-approved template name.", { providerTemplateName: "Required" });
  }
  const last = await prisma.messageTemplate.findFirst({ where: { key: t.key, channel: t.channel, locale: t.locale }, orderBy: { version: "desc" } });
  const created = await prisma.messageTemplate.create({ data: { ...t, version: (last?.version ?? 0) + 1, status: "DRAFT" } });
  await audit(prisma, { actorId: staff.id, action: "template.draft_created", entityType: "MessageTemplate", entityId: created.id });
  return created;
}

const FLOW: Record<string, { from: string[]; to: "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED" }> = {
  submit: { from: ["DRAFT"], to: "IN_REVIEW" },
  approve: { from: ["IN_REVIEW"], to: "APPROVED" },
  publish: { from: ["APPROVED"], to: "PUBLISHED" },
  archive: { from: ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED"], to: "ARCHIVED" },
};

export async function transitionTemplate(staff: Staff, id: string, action: string, requestId?: string) {
  const rule = FLOW[action];
  if (!rule) throw new ApiError("NOT_FOUND", "Unknown action.");
  return prisma.$transaction(async (tx) => {
    const t = await tx.messageTemplate.findUnique({ where: { id } });
    if (!t) throw new ApiError("NOT_FOUND", "Template not found.");
    if (!rule.from.includes(t.status)) throw new ApiError("INVALID_TRANSITION", `Cannot ${action} a ${t.status.toLowerCase()} template.`);
    if (action === "publish") {
      await tx.messageTemplate.updateMany({ where: { key: t.key, channel: t.channel, locale: t.locale, status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
    }
    const updated = await tx.messageTemplate.update({
      where: { id },
      data: { status: rule.to, ...(rule.to === "APPROVED" ? { approvedById: staff.id, approvedAt: new Date() } : {}) },
    });
    await audit(tx, { actorId: staff.id, action: `template.${action}`, entityType: "MessageTemplate", entityId: id, data: { key: t.key, version: t.version }, requestId });
    return updated;
  });
}
