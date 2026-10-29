import { NextResponse } from "next/server";
import { route, ApiError } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { drainQueue } from "@/lib/automation/queue";

/** Development convenience: process due jobs inline when the worker process is not running. */
export const POST = route(async (req) => {
  if (process.env.NODE_ENV === "production") throw new ApiError("NOT_FOUND", "Not found.");
  await requireStaff(req, "automation:manage");
  return NextResponse.json({ processed: await drainQueue("dev-inline") });
});
