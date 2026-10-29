import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { validateForPublish, simulate, publishWorkflow, setWorkflowStatus } from "@/lib/automation/workflows";

type Ctx = { params: Promise<{ id: string; action: string }> };

/** POST /api/admin/automation/workflows/:id/{validate|simulate|publish|pause|resume|archive} */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const { id, action } = await params;
  const wf = await prisma.workflow.findUnique({ where: { id } });
  if (!wf) throw new ApiError("NOT_FOUND", "Workflow not found.");
  switch (action) {
    case "validate": {
      await requireStaff(req, "automation:read");
      return NextResponse.json(await validateForPublish(wf.draftGraph));
    }
    case "simulate": {
      await requireStaff(req, "automation:read");
      const { leadReference } = z.object({ leadReference: z.string().trim().min(3).max(40) }).parse(await readJson(req));
      return NextResponse.json(await simulate(wf.draftGraph, leadReference.toUpperCase()));
    }
    case "publish": {
      const staff = await requireStaff(req, "automation:manage");
      const v = await publishWorkflow(staff, id, requestId);
      return NextResponse.json({ version: v.version });
    }
    case "pause":
    case "resume":
    case "archive": {
      const staff = await requireStaff(req, "automation:manage");
      await setWorkflowStatus(staff, id, action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "ARCHIVED", requestId);
      return NextResponse.json({ ok: true });
    }
    default:
      throw new ApiError("NOT_FOUND", "Unknown action.");
  }
});
