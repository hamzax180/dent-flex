import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { addNote, createTask, overrideScore } from "@/lib/services/crm";
import { recordConsent } from "@/lib/automation/consent";

type Ctx = { params: Promise<{ id: string; action: string }> };

/** POST /api/admin/leads/:id/{notes|tasks|score-override|consent} */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const { id, action } = await params;
  const body = await readJson(req);
  switch (action) {
    case "notes": {
      const staff = await requireStaff(req, "leads:note");
      const note = await addNote(staff, id, z.object({ body: z.string() }).parse(body).body);
      return NextResponse.json({ note: { id: note.id } }, { status: 201 });
    }
    case "tasks": {
      const staff = await requireStaff(req, "tasks:write");
      const task = await createTask(staff, id, body, requestId);
      return NextResponse.json({ task: { id: task.id } }, { status: 201 });
    }
    case "score-override": {
      const staff = await requireStaff(req, "leads:score_override");
      await overrideScore(staff, id, body, requestId);
      return NextResponse.json({ ok: true });
    }
    case "consent": {
      const staff = await requireStaff(req, "consent:manage");
      await recordConsent(staff, id, body, requestId);
      return NextResponse.json({ ok: true });
    }
    default:
      throw new ApiError("NOT_FOUND", "Unknown action.");
  }
});
