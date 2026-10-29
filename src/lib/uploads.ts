import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { recordSignal, type SignalType } from "./interest";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const UPLOAD_KINDS = ["XRAY", "SMILE_PHOTO", "OTHER"] as const;
export type UploadKindName = (typeof UPLOAD_KINDS)[number];

/** Allowed types are checked by the file's magic bytes, not by the name or the browser's claim. */
function sniff(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|mif1|msf1|hevc)/.test(b.subarray(8, 12).toString("latin1"))) return "image/heic";
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

const SIGNAL: Record<UploadKindName, SignalType> = { XRAY: "uploaded_xray", SMILE_PHOTO: "uploaded_smile_photo", OTHER: "uploaded_file" };

export async function saveUpload(input: {
  conversationToken: string; kind: UploadKindName; treatmentSlug?: string | null; consent: boolean; file: File;
}) {
  if (!input.consent) throw new ApiError("VALIDATION_ERROR", "Please tick the box to agree before sharing an image.");
  if (input.file.size === 0) throw new ApiError("VALIDATION_ERROR", "That file is empty.");
  if (input.file.size > MAX_UPLOAD_BYTES) throw new ApiError("VALIDATION_ERROR", "Please choose a file under 8 MB.");
  const conv = await prisma.conversation.findUnique({ where: { publicToken: input.conversationToken }, include: { _count: { select: { uploads: true } } } });
  if (!conv || conv.status === "CLOSED") throw new ApiError("NOT_FOUND", "Conversation not found.");
  if (conv._count.uploads >= 6) throw new ApiError("RATE_LIMITED", "You've shared the maximum number of files for this chat.");

  const data = Buffer.from(await input.file.arrayBuffer());
  const mime = sniff(data);
  if (!mime) throw new ApiError("VALIDATION_ERROR", "Please upload a JPG, PNG, WebP, HEIC photo or a PDF.");
  const treatment = input.treatmentSlug ? await prisma.treatment.findUnique({ where: { slug: input.treatmentSlug }, select: { slug: true } }) : null;

  const upload = await prisma.upload.create({
    data: {
      conversationId: conv.id,
      kind: input.kind,
      treatmentSlug: treatment?.slug ?? null,
      fileName: input.file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "upload",
      mime,
      sizeBytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
      data,
      consentAt: new Date(),
    },
    select: { id: true, kind: true, treatmentSlug: true, mime: true, sizeBytes: true, createdAt: true },
  });
  await prisma.conversation.update({ where: { id: conv.id }, data: { lastActivityAt: new Date() } });
  await recordSignal(conv.id, SIGNAL[input.kind], ...(treatment ? (["chose_treatment"] as const) : []));
  return upload;
}
