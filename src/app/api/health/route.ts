import { NextResponse } from "next/server";

/** Liveness: the process is up. Does not touch the database. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
