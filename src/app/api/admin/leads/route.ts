import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { listLeads } from "@/lib/services/crm";
import { createLead } from "@/lib/services/leads";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export const GET = route(async (req) => {
  const staff = await requireStaff(req, "leads:read");
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return NextResponse.json(await listLeads(staff, params));
});

const staffLeadSchema = z.object({
  source: z.enum(["PHONE", "WALK_IN", "REFERRAL", "OTHER"]),
  sourceDetail: z.string().trim().max(120).optional(),
  /** Staff attest the privacy notice was given (read out / handed over) before recording details. */
  noticeGiven: z.literal(true, { errorMap: () => ({ message: "Confirm the privacy notice was given to the patient." }) }),
  ownerId: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/admin/leads — reception records a phone, walk-in or referral inquiry.
 * Goes through the same lead service as the website and AI (dedupe, scoring, consent, events).
 */
export const POST = route(async (req, { requestId }) => {
  const staff = await requireStaff(req, "leads:write");
  const body = (await readJson(req)) as Record<string, unknown>;
  const meta = staffLeadSchema.parse(body);
  const result = await createLead(
    { ...body, privacyNoticeAccepted: true, website: "" },
    {
      source: meta.source,
      sourceDetail: meta.sourceDetail,
      actorId: staff.id,
      ownerId: meta.ownerId ?? staff.id,
      consentEvidence: `Privacy notice given by ${staff.name} (${meta.source.toLowerCase().replace("_", "-")})`,
      idempotencyKey: req.headers.get("idempotency-key"),
    },
  );
  await audit(prisma, { actorId: staff.id, action: "lead.created_by_staff", entityType: "Lead", entityId: result.leadId, data: { source: meta.source, duplicate: result.duplicate }, requestId });
  return NextResponse.json({ lead: { id: result.leadId, reference: result.publicId, merged: result.duplicate } }, { status: 201 });
});
