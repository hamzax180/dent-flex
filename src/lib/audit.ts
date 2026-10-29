import { Prisma } from "@prisma/client";
import type { Db } from "./db";

/** Security/compliance audit trail. Do not put contact details or message bodies in `data`. */
export function audit(
  db: Db,
  e: { actorId: string | null; action: string; entityType: string; entityId?: string | null; data?: Prisma.InputJsonValue; requestId?: string },
) {
  return db.auditEvent.create({
    data: { actorId: e.actorId, action: e.action, entityType: e.entityType, entityId: e.entityId ?? null, data: e.data, requestId: e.requestId },
  });
}

/** CRM timeline entry for a lead. */
export function activity(db: Db, e: { leadId: string; actorId?: string | null; type: string; data?: Prisma.InputJsonValue }) {
  return db.activityEvent.create({ data: { leadId: e.leadId, actorId: e.actorId ?? null, type: e.type, data: e.data } });
}
