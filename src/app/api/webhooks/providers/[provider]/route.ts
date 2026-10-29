import { NextResponse } from "next/server";
import { route, ApiError } from "@/lib/errors";
import { assertKnownProvider, ingestProviderEvent, verifyProviderSignature } from "@/lib/automation/webhooks";

type Ctx = { params: Promise<{ provider: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { provider } = await params;
  assertKnownProvider(provider);
  const raw = await req.text();
  if (raw.length > 64_000) throw new ApiError("VALIDATION_ERROR", "Payload too large.");
  if (!verifyProviderSignature(raw, req.headers.get("x-dentflex-timestamp"), req.headers.get("x-dentflex-signature"))) {
    throw new ApiError("UNAUTHENTICATED", "Invalid signature.");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON.");
  }
  return NextResponse.json(await ingestProviderEvent(provider, body));
});
