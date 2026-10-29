import { route, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { leadScope } from "@/lib/services/crm";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/uploads/:id — staff-only view of a visitor's file (audited, never cached). */
export const GET = route<Ctx>(async (req, { params }) => {
  const staff = await requireStaff(req, "leads:read");
  const { id } = await params;
  const upload = await prisma.upload.findUnique({ where: { id }, include: { conversation: { select: { leadId: true } } } });
  if (!upload) throw new ApiError("NOT_FOUND", "File not found.");
  const leadId = upload.leadId ?? upload.conversation?.leadId;
  if (leadId) {
    const visible = await prisma.lead.count({ where: { AND: [leadScope(staff), { id: leadId }] } });
    if (!visible) throw new ApiError("NOT_FOUND", "File not found.");
  }
  await audit(prisma, { actorId: staff.id, action: "upload.viewed", entityType: "Upload", entityId: upload.id });
  return new Response(new Uint8Array(upload.data), {
    headers: {
      "Content-Type": upload.mime,
      "Content-Disposition": `inline; filename="${upload.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
