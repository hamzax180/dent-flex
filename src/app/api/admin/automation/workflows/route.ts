import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export const GET = route(async (req) => {
  await requireStaff(req, "automation:read");
  const workflows = await prisma.workflow.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, description: true, status: true, templateKey: true, activeVersionId: true, updatedAt: true },
  });
  return NextResponse.json({ workflows });
});

const blank = {
  nodes: [
    { id: "trigger", type: "trigger", config: { events: ["lead.created"] } },
    { id: "end", type: "exit", config: { reason: "done" } },
  ],
  edges: [{ from: "trigger", to: "end" }],
  settings: { stopOn: [], goalStatuses: [], allowReenrollment: false },
};

export const POST = route(async (req, { requestId }) => {
  const staff = await requireStaff(req, "automation:manage");
  const { name, description } = z.object({ name: z.string().trim().min(3).max(120), description: z.string().max(500).optional() }).parse(await readJson(req));
  const wf = await prisma.workflow.create({ data: { name, description, draftGraph: blank as Prisma.InputJsonValue } });
  await audit(prisma, { actorId: staff.id, action: "workflow.created", entityType: "Workflow", entityId: wf.id, requestId });
  return NextResponse.json({ workflow: { id: wf.id } }, { status: 201 });
});
