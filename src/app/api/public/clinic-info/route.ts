import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = route(async () => NextResponse.json({ clinic: await getSetting("clinic_info") }));
