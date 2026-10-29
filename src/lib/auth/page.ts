import { redirect } from "next/navigation";
import { getStaff, type Staff } from "./session";
import { can, type Permission } from "./rbac";

/** For server components: signed-in staff with the permission, or redirect/deny. */
export async function requirePageStaff(perm?: Permission): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/crm/login");
  if (perm && !can(staff.role, perm)) redirect("/crm?denied=1");
  return staff;
}
