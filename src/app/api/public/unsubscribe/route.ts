import { NextResponse } from "next/server";
import { route, ApiError } from "@/lib/errors";
import { unsubscribe } from "@/lib/automation/unsubscribe";

/** RFC 8058 one-click unsubscribe (POST from mail clients) and the confirmation page's form. */
export const POST = route(async (req) => {
  const url = new URL(req.url);
  const res = await unsubscribe(url.searchParams.get("t") ?? "", url.searchParams.get("s") ?? "");
  if (!res.ok) throw new ApiError("VALIDATION_ERROR", "This unsubscribe link is invalid.");
  return NextResponse.json({ ok: true });
});
