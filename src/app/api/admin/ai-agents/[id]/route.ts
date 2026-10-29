import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/errors";
import { requireStaff } from "@/lib/auth/session";
import { updateAgent } from "@/lib/assistant/agents";
import { TTS_VOICES } from "@/lib/assistant/speech";

type Ctx = { params: Promise<{ id: string }> };

const schema = z
  .object({
    active: z.boolean().optional(),
    maxConcurrent: z.number().int().min(1).max(20).optional(),
    name: z.string().trim().min(2).max(40).optional(),
    tagline: z.string().trim().min(2).max(80).optional(),
    style: z.string().trim().min(5).max(300).optional(),
    voice: z.enum(TTS_VOICES).optional(),
  })
  .strict();

/** PATCH /api/admin/ai-agents/:id — admin only, audited. */
export const PATCH = route<Ctx>(async (req, { params, requestId }) => {
  const staff = await requireStaff(req, "settings:manage");
  await updateAgent(staff, (await params).id, schema.parse(await readJson(req)), requestId);
  return NextResponse.json({ ok: true });
});
