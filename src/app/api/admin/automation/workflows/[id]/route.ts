import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { saveDraft } from "@/lib/automation/workflows";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  await requireStaff(req, "automation:read");
  const wf = await prisma.workflow.findUnique({
    where: { id: (await params).id },
    include: { versions: { orderBy: { version: "desc" }, select: { id: true, version: true, publishedAt: true, triggerTypes: true } } },
  });
  if (!wf) throw new ApiError("NOT_FOUND", "Workflow not found.");
  return NextResponse.json({ workflow: wf });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const staff = await requireStaff(req, "automation:manage");
  const body = z.object({ graph: z.unknown(), name: z.string().trim().min(3).max(120).optional(), description: z.string().max(500).optional() }).parse(await readJson(req, 200_000));
  const res = await saveDraft(staff, (await params).id, body.graph, body);
  return NextResponse.json({ validation: res.validation });
});
