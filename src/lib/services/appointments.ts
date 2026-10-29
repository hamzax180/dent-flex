import { prisma, type Tx } from "../db";
import { ApiError } from "../errors";
import { activity, audit } from "../audit";
import { emitEvent } from "../jobs";
import type { Staff } from "../auth/session";

/**
 * Confirmation is an explicit, authorised staff action recorded after the slot is
 * actually agreed (phone call / clinic calendar). No AI or visitor path calls this.
 */
export async function confirmAppointmentRequest(
  requestId: string,
  input: { startAt: Date; durationMinutes: number; clinicianId?: string | null },
  actor: Staff,
  reqId?: string,
) {
  if (input.startAt.getTime() < Date.now() - 60_000) throw new ApiError("VALIDATION_ERROR", "Appointment time must be in the future.");
  return prisma.$transaction(async (tx) => {
    const request = await tx.appointmentRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new ApiError("NOT_FOUND", "Appointment request not found.");
    if (!["REQUESTED", "IN_REVIEW"].includes(request.status)) {
      throw new ApiError("INVALID_TRANSITION", `This request is already ${request.status.toLowerCase()}.`);
    }
    if (input.clinicianId) {
      const c = await tx.staffUser.findFirst({ where: { id: input.clinicianId, role: "CLINICIAN", active: true } });
      if (!c) throw new ApiError("VALIDATION_ERROR", "Choose an active clinician.", { clinicianId: "Unknown clinician" });
    }
    const appt = await tx.appointment.create({
      data: {
        leadId: request.leadId,
        startAt: input.startAt,
        endAt: new Date(input.startAt.getTime() + input.durationMinutes * 60_000),
        confirmedById: actor.id,
        clinicianId: input.clinicianId ?? null,
      },
    });
    await tx.appointmentRequest.update({ where: { id: request.id }, data: { status: "CONFIRMED", appointmentId: appt.id } });
    await tx.lead.update({ where: { id: request.leadId }, data: { status: "APPOINTMENT_CONFIRMED", lastActivityAt: new Date() } });
    await activity(tx, { leadId: request.leadId, actorId: actor.id, type: "appointment.confirmed", data: { appointmentId: appt.id, startAt: appt.startAt.toISOString() } });
    await audit(tx, { actorId: actor.id, action: "appointment.confirmed", entityType: "Appointment", entityId: appt.id, requestId: reqId });
    await emitEvent(tx, {
      type: "appointment.confirmed", dedupeKey: `appt.confirmed:${appt.id}:1`, leadId: request.leadId, appointmentId: appt.id,
      payload: { revision: 1, startAt: appt.startAt.toISOString() },
    });
    return appt;
  });
}

export async function declineAppointmentRequest(requestId: string, actor: Staff, reqId?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.appointmentRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new ApiError("NOT_FOUND", "Appointment request not found.");
    if (!["REQUESTED", "IN_REVIEW"].includes(request.status)) throw new ApiError("INVALID_TRANSITION", "Request is not open.");
    await tx.appointmentRequest.update({ where: { id: requestId }, data: { status: "DECLINED" } });
    await activity(tx, { leadId: request.leadId, actorId: actor.id, type: "appointment_request.declined" });
    await audit(tx, { actorId: actor.id, action: "appointment_request.declined", entityType: "AppointmentRequest", entityId: requestId, requestId: reqId });
  });
}

/** Reschedule bumps the revision; reminder enrollments pinned to the old revision are stopped. */
export async function rescheduleAppointment(id: string, startAt: Date, durationMinutes: number, actor: Staff, reqId?: string) {
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({ where: { id } });
    if (!appt) throw new ApiError("NOT_FOUND", "Appointment not found.");
    if (appt.status !== "CONFIRMED") throw new ApiError("INVALID_TRANSITION", "Only confirmed appointments can be rescheduled.");
    const revision = appt.revision + 1;
    const updated = await tx.appointment.update({
      where: { id }, data: { startAt, endAt: new Date(startAt.getTime() + durationMinutes * 60_000), revision },
    });
    await stopAppointmentEnrollments(tx, id, "appointment rescheduled");
    await activity(tx, { leadId: appt.leadId, actorId: actor.id, type: "appointment.rescheduled", data: { startAt: startAt.toISOString() } });
    await audit(tx, { actorId: actor.id, action: "appointment.rescheduled", entityType: "Appointment", entityId: id, requestId: reqId });
    await emitEvent(tx, {
      type: "appointment.rescheduled", dedupeKey: `appt.rescheduled:${id}:${revision}`, leadId: appt.leadId, appointmentId: id,
      payload: { revision, startAt: startAt.toISOString() },
    });
    return updated;
  });
}

export async function setAppointmentOutcome(id: string, status: "CANCELLED" | "COMPLETED" | "NO_SHOW", actor: Staff, reqId?: string) {
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({ where: { id } });
    if (!appt) throw new ApiError("NOT_FOUND", "Appointment not found.");
    if (appt.status !== "CONFIRMED") throw new ApiError("INVALID_TRANSITION", `Appointment is already ${appt.status.toLowerCase()}.`);
    const updated = await tx.appointment.update({ where: { id }, data: { status } });
    await stopAppointmentEnrollments(tx, id, `appointment ${status.toLowerCase()}`);
    if (status === "COMPLETED") await tx.lead.update({ where: { id: appt.leadId }, data: { status: "VISITED" } });
    const type = status === "CANCELLED" ? "appointment.cancelled" : status === "COMPLETED" ? "appointment.completed" : "appointment.no_show";
    await activity(tx, { leadId: appt.leadId, actorId: actor.id, type });
    await audit(tx, { actorId: actor.id, action: type, entityType: "Appointment", entityId: id, requestId: reqId });
    await emitEvent(tx, { type, dedupeKey: `${type}:${id}`, leadId: appt.leadId, appointmentId: id, payload: { revision: appt.revision } });
    return updated;
  });
}

/** Stop reminder-style enrollments and cancel their pending jobs/deliveries so nothing stale is sent. */
export async function stopAppointmentEnrollments(tx: Tx, appointmentId: string, reason: string) {
  const enrollments = await tx.workflowEnrollment.findMany({ where: { appointmentId, status: "ACTIVE" }, select: { id: true } });
  if (!enrollments.length) return 0;
  const ids = enrollments.map((e) => e.id);
  await tx.workflowEnrollment.updateMany({ where: { id: { in: ids } }, data: { status: "STOPPED", stopReason: reason } });
  for (const id of ids) {
    await tx.job.updateMany({ where: { status: { in: ["PENDING", "FAILED"] }, dedupeKey: { startsWith: `step:${id}:` } }, data: { status: "CANCELLED" } });
  }
  await tx.messageDelivery.updateMany({ where: { enrollmentId: { in: ids }, status: "QUEUED" }, data: { status: "BLOCKED", failureCode: "enrollment_stopped" } });
  return ids.length;
}
