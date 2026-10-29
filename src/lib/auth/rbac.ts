import type { StaffRole } from "@prisma/client";

/**
 * Server-side permission matrix. UI hiding is cosmetic; every API handler
 * calls requirePermission() with one of these.
 */
export const PERMISSIONS = {
  "leads:read": ["ADMIN", "RECEPTIONIST", "CLINICIAN"],
  "leads:write": ["ADMIN", "RECEPTIONIST"],
  "leads:contact": ["ADMIN", "RECEPTIONIST"], // clinicians see masked contact details
  "leads:note": ["ADMIN", "RECEPTIONIST", "CLINICIAN"],
  "leads:score_override": ["ADMIN", "RECEPTIONIST"],
  "tasks:read": ["ADMIN", "RECEPTIONIST", "CLINICIAN"],
  "tasks:write": ["ADMIN", "RECEPTIONIST"],
  "appointments:read": ["ADMIN", "RECEPTIONIST", "CLINICIAN"],
  "appointments:manage": ["ADMIN", "RECEPTIONIST"],
  "conversations:read": ["ADMIN", "RECEPTIONIST"],
  "treatments:manage": ["ADMIN"],
  "prices:approve": ["ADMIN"],
  "settings:manage": ["ADMIN"],
  "users:manage": ["ADMIN"],
  "reports:read": ["ADMIN", "RECEPTIONIST"],
  "ai_usage:read": ["ADMIN"],
  "consent:manage": ["ADMIN", "RECEPTIONIST"],
  "automation:read": ["ADMIN", "RECEPTIONIST"],
  "automation:manage": ["ADMIN"],
  "campaigns:draft": ["ADMIN", "RECEPTIONIST"],
  "campaigns:approve": ["ADMIN"],
  "audit:read": ["ADMIN"],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: StaffRole, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly StaffRole[]).includes(role);
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return `${phone.slice(0, 3)}****${phone.slice(-2)}`;
}
