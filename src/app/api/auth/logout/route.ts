import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { destroySession } from "@/lib/auth/session";

export const POST = route(async () => {
  await destroySession();
  return NextResponse.json({ ok: true });
});
