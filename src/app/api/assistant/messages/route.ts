import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { handleAssistantMessage, assertAssistantAvailable } from "@/lib/assistant/assistant";

export const POST = route(async (req) => {
  assertAssistantAvailable();
  const ip = clientIp(req);
  await rateLimit(`assistant:ip:${ip}`, 20, 60);
  await rateLimit(`assistant:ip-day:${ip}`, 300, 86400);
  const result = await handleAssistantMessage(await readJson(req, 40_000));
  return NextResponse.json(result);
});
