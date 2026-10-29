import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createCampaign, previewAudience } from "@/lib/automation/campaigns";
import { createTemplateVersion } from "@/lib/automation/message-templates";
import { automationReport, DEFINITIONS } from "@/lib/services/reports";

type Ctx = { params: Promise<{ resource: string }> };

/** GET /api/admin/automation/{campaigns|templates|analytics|jobs} */
export const GET = route<Ctx>(async (req, { params }) => {
  const { resource } = await params;
  const url = new URL(req.url);
  switch (resource) {
    case "campaigns":
      await requireStaff(req, "automation:read");
      return NextResponse.json({ campaigns: await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) });
    case "templates":
      await requireStaff(req, "automation:read");
      return NextResponse.json({ templates: await prisma.messageTemplate.findMany({ orderBy: [{ key: "asc" }, { version: "desc" }] }) });
    case "jobs":
      await requireStaff(req, "automation:read");
      return NextResponse.json({
        jobs: await prisma.job.findMany({ where: { status: { in: ["DEAD", "FAILED"] } }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, type: true, status: true, attempts: true, lastError: true, updatedAt: true } }),
      });
    case "analytics": {
      await requireStaff(req, "reports:read");
      const from = new Date(url.searchParams.get("from") ?? Date.now() - 30 * 86400_000);
      const to = new Date(url.searchParams.get("to") ?? Date.now());
      return NextResponse.json({ definitions: DEFINITIONS, report: await automationReport(from, to) });
    }
  }
  throw new ApiError("NOT_FOUND", "Unknown resource.");
});

/** POST /api/admin/automation/{campaigns|templates|segments} */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const { resource } = await params;
  const body = await readJson(req, 64_000);
  switch (resource) {
    case "campaigns": {
      const c = await createCampaign(await requireStaff(req, "campaigns:draft"), body, requestId);
      return NextResponse.json({ campaign: { id: c.id } }, { status: 201 });
    }
    case "templates": {
      const t = await createTemplateVersion(await requireStaff(req, "campaigns:draft"), body);
      return NextResponse.json({ template: { id: t.id, version: t.version } }, { status: 201 });
    }
    case "segments": {
      await requireStaff(req, "campaigns:draft");
      const p = z.object({ channel: z.enum(["EMAIL", "WHATSAPP"]), segment: z.unknown() }).parse(body);
      return NextResponse.json(await previewAudience(p.channel, p.segment));
    }
  }
  throw new ApiError("NOT_FOUND", "Unknown resource.");
});
