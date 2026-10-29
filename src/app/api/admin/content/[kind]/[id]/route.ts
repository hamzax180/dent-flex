import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { CONTENT, contentKind, deleteContent, updateContent } from "@/lib/services/content";

type Ctx = { params: Promise<{ kind: string; id: string }> };

/** PATCH/DELETE /api/admin/content/{treatments|faqs|team}/:id */
export const PATCH = route<Ctx>(async (req, { params, requestId }) => {
  const { kind: k, id } = await params;
  const kind = contentKind(k);
  const staff = await requireStaff(req, CONTENT[kind].perm);
  await updateContent(kind, id, await readJson(req, 16_000), staff, requestId);
  return NextResponse.json({ ok: true });
});

export const DELETE = route<Ctx>(async (req, { params, requestId }) => {
  const { kind: k, id } = await params;
  const kind = contentKind(k);
  const staff = await requireStaff(req, CONTENT[kind].perm);
  await deleteContent(kind, id, staff, requestId);
  return NextResponse.json({ ok: true });
});
