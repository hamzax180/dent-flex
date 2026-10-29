import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { CONTENT, contentKind, createContent } from "@/lib/services/content";

type Ctx = { params: Promise<{ kind: string }> };

/** POST /api/admin/content/{treatments|faqs|team} */
export const POST = route<Ctx>(async (req, { params, requestId }) => {
  const kind = contentKind((await params).kind);
  const staff = await requireStaff(req, CONTENT[kind].perm);
  const row = await createContent(kind, await readJson(req, 16_000), staff, requestId);
  return NextResponse.json({ id: row.id }, { status: 201 });
});
