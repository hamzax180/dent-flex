import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { getLeadDetail, updateLead } from "@/lib/services/crm";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const staff = await requireStaff(req, "leads:read");
  return NextResponse.json({ lead: await getLeadDetail(staff, (await params).id) });
});

export const PATCH = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "leads:write");
  const lead = await updateLead(staff, (await params).id, await readJson(req), requestId);
  return NextResponse.json({ lead: { id: lead.id, status: lead.status } });
});
