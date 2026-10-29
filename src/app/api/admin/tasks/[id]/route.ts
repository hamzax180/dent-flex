import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { updateTask } from "@/lib/services/crm";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const staff = await requireStaff(req, "tasks:write");
  const task = await updateTask(staff, (await params).id, await readJson(req));
  return NextResponse.json({ task: { id: task.id, status: task.status } });
});
