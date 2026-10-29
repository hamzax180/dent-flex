import { NextResponse } from "next/server";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { stopEnrollment, retryDeadJob } from "@/lib/automation/workflows";
import { transitionTemplate } from "@/lib/automation/message-templates";
import { previewAudience, testSendCampaign, transitionCampaign, campaignTransitionPermission, segmentSchema } from "@/lib/automation/campaigns";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ resource: string; id: string; action: string }> };

/**
 * POST /api/admin/automation/enrollments/:id/stop
 * POST /api/admin/automation/jobs/:id/retry
 * POST /api/admin/automation/templates/:id/{submit|approve|publish|archive}
 * POST /api/admin/automation/campaigns/:id/{preview|test-send|submit|approve|schedule|pause|resume|cancel}
 */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const { resource, id, action } = await params;
  if (resource === "enrollments" && action === "stop") {
    await stopEnrollment(await requireStaff(req, "automation:manage"), id, requestId);
    return NextResponse.json({ ok: true });
  }
  if (resource === "jobs" && action === "retry") {
    await retryDeadJob(await requireStaff(req, "automation:manage"), id, requestId);
    return NextResponse.json({ ok: true });
  }
  if (resource === "templates") {
    const staff = await requireStaff(req, ["approve", "publish"].includes(action) ? "campaigns:approve" : "campaigns:draft");
    const t = await transitionTemplate(staff, id, action, requestId);
    return NextResponse.json({ template: { id: t.id, status: t.status } });
  }
  if (resource === "campaigns") {
    if (action === "preview") {
      await requireStaff(req, "campaigns:draft");
      const c = await prisma.campaign.findUnique({ where: { id } });
      if (!c) throw new ApiError("NOT_FOUND", "Campaign not found.");
      return NextResponse.json(await previewAudience(c.channel as "EMAIL" | "WHATSAPP", segmentSchema.parse(c.segment)));
    }
    if (action === "test-send") {
      const res = await testSendCampaign(await requireStaff(req, "campaigns:draft"), id);
      return NextResponse.json({ ok: true, providerMessageId: res.providerMessageId });
    }
    const t = action as "submit" | "approve" | "schedule" | "pause" | "resume" | "cancel";
    if (!["submit", "approve", "schedule", "pause", "resume", "cancel"].includes(t)) throw new ApiError("NOT_FOUND", "Unknown action.");
    const staff = await requireStaff(req, campaignTransitionPermission(t));
    const c = await transitionCampaign(staff, id, t, await readJson(req), requestId);
    return NextResponse.json({ campaign: { id: c.id, status: c.status } });
  }
  throw new ApiError("NOT_FOUND", "Unknown action.");
});
