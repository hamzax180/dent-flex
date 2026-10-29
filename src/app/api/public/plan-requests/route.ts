import { NextResponse } from "next/server";
import { route, ApiError } from "@/lib/errors";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES, UPLOAD_KINDS, type UploadKindName } from "@/lib/uploads";
import { MAX_PLAN_FILES, requestPlan } from "@/lib/services/plans";

const str = (f: FormData, k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string).trim() : "") || undefined;

/**
 * POST /api/public/plan-requests (multipart) — "Get your free treatment plan".
 * Fields mirror the lead form plus up to 4 files (file0..file3 with kind0..kind3) and an upload consent.
 */
export const POST = route(async (req) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PLAN_FILES * MAX_UPLOAD_BYTES + 64_000) throw new ApiError("VALIDATION_ERROR", "Files are too large.");
  const ip = clientIp(req);
  await rateLimit(`plan:ip:${ip}`, 3, 600);
  await rateLimit(`plan:ip-day:${ip}`, 10, 86_400);
  const form = await req.formData();
  if (form.get("uploadConsent") !== "true") throw new ApiError("VALIDATION_ERROR", "Please agree to us storing your images for the dentist's review.");

  const files: { kind: UploadKindName; file: File }[] = [];
  for (let i = 0; i < MAX_PLAN_FILES; i++) {
    const file = form.get(`file${i}`);
    if (!(file instanceof File) || file.size === 0) continue;
    const kind = str(form, `kind${i}`) as UploadKindName;
    files.push({ kind: UPLOAD_KINDS.includes(kind) ? kind : "OTHER", file });
  }

  const result = await requestPlan({
    lead: {
      fullName: str(form, "fullName") ?? "",
      email: str(form, "email") ?? "",
      phone: str(form, "phone") ?? "",
      language: str(form, "language") ?? "en",
      treatmentSlug: str(form, "treatmentSlug"),
      nextStepRequested: "PRICE_INFO",
      appointmentIntent: false,
      privacyNoticeAccepted: form.get("privacyNoticeAccepted") === "true",
      marketingOptIn: form.get("marketingOptIn") === "true",
      website: str(form, "website") ?? "",
    },
    country: str(form, "country"),
    files,
    idempotencyKey: req.headers.get("idempotency-key"),
  });
  return NextResponse.json(result, { status: 201 });
});
