import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { acceptPlan } from "@/lib/services/plans";

type Ctx = { params: Promise<{ token: string }> };

/** POST /api/public/plans/:token/accept — the patient wants to book from their plan. */
export const POST = route<Ctx>(async (req, { params }) => {
  await rateLimit(`plan-accept:ip:${clientIp(req)}`, 10, 600);
  return NextResponse.json(await acceptPlan((await params).token));
});
