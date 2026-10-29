import { NextResponse } from "next/server";
import { route } from "@/lib/errors";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const faqs = await prisma.faq.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { sortOrder: "asc" },
    select: { id: true, questionEn: true, answerEn: true, questionTr: true, answerTr: true },
  });
  return NextResponse.json({ faqs });
});
