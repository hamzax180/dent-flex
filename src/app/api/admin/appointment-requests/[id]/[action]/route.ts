import { NextResponse } from "next/server";
import { z } from "zod";
import { clinicDateTime } from "@/lib/validation/dates";
import { route, readJson, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { confirmAppointmentRequest, declineAppointmentRequest } from "@/lib/services/appointments";

type Ctx = { params: Promise<{ id: string; action: string }> };

const confirmSchema = z.object({
  startAt: clinicDateTime,
  durationMinutes: z.number().int().min(10).max(480).default(30),
  clinicianId: z.string().uuid().nullable().optional(),
  // Explicit attestation: staff agreed this slot with the patient / clinic calendar.
  slotAgreed: z.literal(true, { errorMap: () => ({ message: "Confirm the slot was agreed with the patient." }) }),
});

/** POST /api/admin/appointment-requests/:id/{confirm|decline} */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "appointments:manage");
  const { id, action } = await params;
  if (action === "confirm") {
    const input = confirmSchema.parse(await readJson(req));
    const appt = await confirmAppointmentRequest(id, input, staff, requestId);
    return NextResponse.json({ appointment: { id: appt.id, startAt: appt.startAt } }, { status: 201 });
  }
  if (action === "decline") {
    await declineAppointmentRequest(id, staff, requestId);
    return NextResponse.json({ ok: true });
  }
  throw new ApiError("NOT_FOUND", "Unknown action.");
});
