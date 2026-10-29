import { NextResponse } from "next/server";
import { z } from "zod";
import { route, ApiError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES, UPLOAD_KINDS, saveUpload } from "@/lib/uploads";

const fields = z.object({
  conversationToken: z.string().min(8).max(100),
  kind: z.enum(UPLOAD_KINDS),
  treatment: z.string().max(60).optional(),
  consent: z.literal("true", { errorMap: () => ({ message: "Consent is required." }) }),
});

/**
 * POST /api/assistant/upload (multipart) — optional X-ray / smile photo from chat or a call.
 * The file is never sent to the AI model; staff see it on the lead record.
 */
export const POST = route(async (req) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64_000) throw new ApiError("VALIDATION_ERROR", "Please choose a file under 8 MB.");
  await rateLimit(`upload:ip:${clientIp(req)}`, 10, 600);
  const form = await req.formData();
  const f = fields.parse({
    conversationToken: form.get("conversationToken"),
    kind: form.get("kind"),
    treatment: form.get("treatment") || undefined,
    consent: form.get("consent"),
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("VALIDATION_ERROR", "Please choose a file.");
  const upload = await saveUpload({ conversationToken: f.conversationToken, kind: f.kind, treatmentSlug: f.treatment, consent: true, file });
  return NextResponse.json({ upload });
});
