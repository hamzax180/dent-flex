import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/errors";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { createLead } from "@/lib/services/leads";

export const POST = route(async (req) => {
  const ip = clientIp(req);
  await rateLimit(`lead:ip:${ip}`, 5, 60);
  await rateLimit(`lead:ip-hour:${ip}`, 20, 3600);
  const body = await readJson(req, 8_000);
  // Browser input never sets score, status, owner or source: createLead derives them.
  const result = await createLead(body, {
    source: "WEB_FORM",
    idempotencyKey: req.headers.get("idempotency-key"),
  });
  return NextResponse.json({ reference: result.publicId, appointmentRequested: Boolean(result.appointmentRequestId) }, { status: 201 });
});
