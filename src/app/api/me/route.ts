import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";

export const GET = route(async (req) => NextResponse.json({ user: await requireStaff(req) }));
