import { NextResponse } from "next/server";
import { z } from "zod";
import { clinicDateTime } from "@/lib/validation/dates";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { rescheduleAppointment, setAppointmentOutcome } from "@/lib/services/appointments";

type Ctx = { params: Promise<{ id: string; action: string }> };

/** POST /api/admin/appointments/:id/{reschedule|cancel|complete|no-show} */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "appointments:manage");
  const { id, action } = await params;
  if (action === "reschedule") {
    const p = z.object({ startAt: clinicDateTime, durationMinutes: z.number().int().min(10).max(480).default(30) }).parse(await readJson(req));
    await rescheduleAppointment(id, p.startAt, p.durationMinutes, staff, requestId);
    return NextResponse.json({ ok: true });
  }
  const map = { cancel: "CANCELLED", complete: "COMPLETED", "no-show": "NO_SHOW" } as const;
  const status = map[action as keyof typeof map];
  if (!status) throw new ApiError("NOT_FOUND", "Unknown action.");
  await setAppointmentOutcome(id, status, staff, requestId);
  return NextResponse.json({ ok: true });
});
