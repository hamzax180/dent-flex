import type { TreatmentPriceVersion } from "@prisma/client";
import { prisma, type Db } from "../db";
import { ApiError } from "../errors";
import { audit } from "../audit";
import type { Staff } from "../auth/session";

export type PublicPrice = {
  currency: string;
  amountMinor: number | null;
  minMinor: number | null;
  maxMinor: number | null;
  inclusions: string | null;
  exclusions: string | null;
  effectiveFrom: string;
};

export type PublicTreatment = {
  slug: string;
  name: { en: string; tr: string };
  summary: { en: string; tr: string };
  price: PublicPrice | null; // null → "Contact the clinic for an estimate"
};

/** The one place that decides which price is live: PUBLISHED and inside its effective window. */
export function currentPublished(versions: TreatmentPriceVersion[], at = new Date()): TreatmentPriceVersion | null {
  return (
    versions
      .filter((v) => v.status === "PUBLISHED" && v.effectiveFrom <= at && (!v.effectiveTo || v.effectiveTo > at))
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.version - a.version)[0] ?? null
  );
}

function toPublic(v: TreatmentPriceVersion | null): PublicPrice | null {
  if (!v) return null;
  return {
    currency: v.currency, amountMinor: v.amountMinor, minMinor: v.minMinor, maxMinor: v.maxMinor,
    inclusions: v.inclusions, exclusions: v.exclusions, effectiveFrom: v.effectiveFrom.toISOString(),
  };
}

/** Only active, clinic-approved treatments and their currently published price. Used by the site AND the AI. */
export async function getPublicTreatments(db: Db = prisma): Promise<PublicTreatment[]> {
  const rows = await db.treatment.findMany({
    where: { active: true, approved: true },
    orderBy: { sortOrder: "asc" },
    include: { priceVersions: { where: { status: "PUBLISHED" } } },
  });
  return rows.map((t) => ({
    slug: t.slug,
    name: { en: t.nameEn, tr: t.nameTr },
    summary: { en: t.summaryEn, tr: t.summaryTr },
    price: toPublic(currentPublished(t.priceVersions)),
  }));
}

// ───────────── Sourced price comparisons ─────────────

export type PriceComparison = {
  slug: string;
  treatment: { en: string; tr: string };
  market: string;
  marketLabel: string;
  currency: string;
  clinic: { minMinor: number; maxMinor: number; isFrom: boolean };
  elsewhere: { minMinor: number; maxMinor: number };
  /** Null when currencies differ: we never convert with made-up exchange rates. */
  savings: { minMinor: number; maxMinor: number; percentMid: number } | null;
  source: { name: string; url: string | null; checkedAt: string };
};

/**
 * Compares the clinic's currently published price with a published, sourced reference price
 * from another market. Returns nothing unless BOTH sides are published.
 */
export async function getPriceComparisons(filter: { treatment?: string; market?: string } = {}, db: Db = prisma): Promise<PriceComparison[]> {
  const q = filter.treatment?.toLowerCase().trim();
  const rows = await db.treatment.findMany({
    where: { active: true, approved: true },
    orderBy: { sortOrder: "asc" },
    include: {
      priceVersions: { where: { status: "PUBLISHED" } },
      comparisonPrices: { where: { status: "PUBLISHED", ...(filter.market ? { market: filter.market.toUpperCase() } : {}) }, orderBy: { checkedAt: "desc" } },
    },
  });
  const out: PriceComparison[] = [];
  for (const t of rows) {
    if (q && !(t.slug.includes(q) || t.nameEn.toLowerCase().includes(q) || t.nameTr.toLowerCase().includes(q))) continue;
    const live = currentPublished(t.priceVersions);
    if (!live) continue;
    const clinicMin = live.minMinor ?? live.amountMinor;
    const clinicMax = live.maxMinor ?? live.amountMinor;
    if (clinicMin == null || clinicMax == null) continue;
    const seen = new Set<string>();
    for (const c of t.comparisonPrices) {
      if (seen.has(c.market)) continue; // latest per market
      seen.add(c.market);
      const same = c.currency === live.currency;
      const savings = same
        ? {
            minMinor: Math.max(0, c.minMinor - clinicMax),
            maxMinor: Math.max(0, c.maxMinor - clinicMin),
            percentMid: Math.max(0, Math.round((1 - (clinicMin + clinicMax) / (c.minMinor + c.maxMinor)) * 100)),
          }
        : null;
      out.push({
        slug: t.slug,
        treatment: { en: t.nameEn, tr: t.nameTr },
        market: c.market,
        marketLabel: c.marketLabel,
        currency: live.currency,
        clinic: { minMinor: clinicMin, maxMinor: clinicMax, isFrom: live.amountMinor != null && live.minMinor == null },
        elsewhere: { minMinor: c.minMinor, maxMinor: c.maxMinor },
        savings,
        source: { name: c.sourceName, url: c.sourceUrl, checkedAt: c.checkedAt.toISOString() },
      });
      if (!same) out[out.length - 1].currency = `${live.currency}/${c.currency}`;
    }
  }
  return out;
}

export async function createComparisonPrice(
  treatmentId: string,
  input: { market: string; marketLabel: string; currency: string; minMinor: number; maxMinor: number; sourceName: string; sourceUrl?: string | null; checkedAt: Date },
  actor: Staff,
  requestId?: string,
) {
  if (input.minMinor > input.maxMinor) throw new ApiError("VALIDATION_ERROR", "Minimum must not exceed maximum.", { minMinor: "Min > max" });
  const t = await prisma.treatment.findUnique({ where: { id: treatmentId } });
  if (!t) throw new ApiError("NOT_FOUND", "Treatment not found.");
  const row = await prisma.comparisonPrice.create({
    data: { treatmentId, ...input, market: input.market.toUpperCase(), currency: input.currency.toUpperCase(), sourceUrl: input.sourceUrl || null, createdById: actor.id },
  });
  await audit(prisma, { actorId: actor.id, action: "comparison_price.created", entityType: "ComparisonPrice", entityId: row.id, data: { treatmentId, market: row.market }, requestId });
  return row;
}

export async function setComparisonStatus(id: string, status: "PUBLISHED" | "DRAFT", actor: Staff, requestId?: string) {
  const row = await prisma.comparisonPrice.findUnique({ where: { id } });
  if (!row) throw new ApiError("NOT_FOUND", "Comparison price not found.");
  await prisma.comparisonPrice.update({ where: { id }, data: { status } });
  await audit(prisma, { actorId: actor.id, action: status === "PUBLISHED" ? "comparison_price.published" : "comparison_price.unpublished", entityType: "ComparisonPrice", entityId: id, requestId });
}

export function formatMoney(minor: number, currency: string, locale = "en") {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(minor / 100);
}

export function describePrice(p: PublicPrice, locale = "en"): string {
  if (p.minMinor != null && p.maxMinor != null) return `${formatMoney(p.minMinor, p.currency, locale)} – ${formatMoney(p.maxMinor, p.currency, locale)}`;
  if (p.amountMinor != null) return `${locale === "tr" ? "Başlangıç" : "From"} ${formatMoney(p.amountMinor, p.currency, locale)}`;
  return "";
}

// ───────────── Admin price workflow: DRAFT → APPROVED → PUBLISHED → ARCHIVED ─────────────

export async function createPriceDraft(
  treatmentId: string,
  input: { currency: string; amountMinor?: number | null; minMinor?: number | null; maxMinor?: number | null; inclusions?: string; exclusions?: string; effectiveFrom: Date; effectiveTo?: Date | null },
  actor: Staff,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.treatment.findUnique({ where: { id: treatmentId } });
    if (!t) throw new ApiError("NOT_FOUND", "Treatment not found.");
    const last = await tx.treatmentPriceVersion.findFirst({ where: { treatmentId }, orderBy: { version: "desc" } });
    const v = await tx.treatmentPriceVersion.create({
      data: {
        treatmentId, version: (last?.version ?? 0) + 1, status: "DRAFT", currency: input.currency.toUpperCase(),
        amountMinor: input.amountMinor ?? null, minMinor: input.minMinor ?? null, maxMinor: input.maxMinor ?? null,
        inclusions: input.inclusions || null, exclusions: input.exclusions || null,
        effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null, createdById: actor.id,
      },
    });
    await audit(tx, { actorId: actor.id, action: "price.draft_created", entityType: "TreatmentPriceVersion", entityId: v.id, data: { treatmentId, version: v.version }, requestId });
    return v;
  });
}

const NEXT: Record<string, string[]> = { DRAFT: ["APPROVED", "ARCHIVED"], APPROVED: ["PUBLISHED", "ARCHIVED"], PUBLISHED: ["ARCHIVED"], ARCHIVED: [] };

/** Published versions are immutable: the only allowed change afterwards is archiving. */
export async function transitionPrice(versionId: string, to: "APPROVED" | "PUBLISHED" | "ARCHIVED", actor: Staff, requestId?: string) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.treatmentPriceVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new ApiError("NOT_FOUND", "Price version not found.");
    if (!NEXT[v.status].includes(to)) throw new ApiError("INVALID_TRANSITION", `Cannot move a ${v.status.toLowerCase()} price to ${to.toLowerCase()}.`);
    const now = new Date();
    const updated = await tx.treatmentPriceVersion.update({
      where: { id: v.id },
      data: {
        status: to,
        ...(to === "APPROVED" ? { approvedById: actor.id, approvedAt: now } : {}),
        ...(to === "PUBLISHED" ? { publishedAt: now } : {}),
        ...(to === "ARCHIVED" && v.status === "PUBLISHED" && (!v.effectiveTo || v.effectiveTo > now) ? { effectiveTo: now } : {}),
      },
    });
    if (to === "PUBLISHED") {
      // Close the window of any earlier published version that would overlap.
      await tx.treatmentPriceVersion.updateMany({
        where: { treatmentId: v.treatmentId, status: "PUBLISHED", id: { not: v.id }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: v.effectiveFrom } }] },
        data: { effectiveTo: v.effectiveFrom > now ? v.effectiveFrom : now },
      });
    }
    await audit(tx, { actorId: actor.id, action: `price.${to.toLowerCase()}`, entityType: "TreatmentPriceVersion", entityId: v.id, data: { treatmentId: v.treatmentId, version: v.version }, requestId });
    return updated;
  });
}
