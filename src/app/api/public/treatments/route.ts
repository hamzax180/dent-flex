import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { getPublicTreatments } from "@/lib/services/pricing";

export const dynamic = "force-dynamic";

export const GET = route(async () => NextResponse.json({ treatments: await getPublicTreatments() }));
