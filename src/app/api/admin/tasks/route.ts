import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { createTask } from "@/lib/services/crm";

export const POST = route(async (req, { requestId }) => {
  const staff = await requireStaff(req, "tasks:write");
  const task = await createTask(staff, null, await readJson(req), requestId);
  return NextResponse.json({ task: { id: task.id } }, { status: 201 });
});
