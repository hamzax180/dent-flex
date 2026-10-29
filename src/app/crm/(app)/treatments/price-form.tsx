"use client";

import { ApiForm, optStr, str } from "@/components/crm/actions";
import { inputCls } from "@/components/crm/ui";

/** Amounts are typed in major units and converted to integer minor units (no floats stored). */
const toMinor = (v: string) => (v === "" ? null : Math.round(Number(v.replace(",", ".")) * 100));

/** Sourced reference price in another market, shown to visitors only when published. */
export function ComparisonForm({ treatmentId }: { treatmentId: string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-forest">Add reference price in another country…</summary>
      <ApiForm
        url={`/api/admin/treatments/${treatmentId}/comparison-prices`}
        submitLabel="Save as draft"
        transform={(fd) => ({
          market: str(fd, "market").toUpperCase(),
          marketLabel: str(fd, "marketLabel"),
          currency: str(fd, "currency"),
          minMinor: toMinor(str(fd, "min")),
          maxMinor: toMinor(str(fd, "max")),
          sourceName: str(fd, "sourceName"),
          sourceUrl: optStr(fd, "sourceUrl") ?? null,
          checkedAt: new Date(str(fd, "checkedAt") || Date.now()).toISOString(),
        })}
      >
        <p className="mt-2 text-xs text-muted">
          Use a citable source (a published price list, a national fee survey or a professional body). Enter it in the <b>same currency</b> as your clinic price, otherwise no saving is calculated.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <input name="market" required maxLength={2} placeholder="GB" className={inputCls} aria-label="Country code" />
          <input name="marketLabel" required placeholder="United Kingdom (private)" className={`${inputCls} sm:col-span-3`} aria-label="Market label" />
          <select name="currency" className={inputCls} aria-label="Currency"><option>EUR</option><option>GBP</option><option>USD</option><option>TRY</option></select>
          <input name="min" required inputMode="decimal" placeholder="Typical min" className={inputCls} aria-label="Typical minimum" />
          <input name="max" required inputMode="decimal" placeholder="Typical max" className={inputCls} aria-label="Typical maximum" />
          <label className="text-xs text-muted">Checked on<input type="date" name="checkedAt" className={`${inputCls} block w-full`} /></label>
          <input name="sourceName" required placeholder="Source name" className={`${inputCls} sm:col-span-2`} aria-label="Source name" />
          <input name="sourceUrl" type="url" placeholder="https://source…" className={`${inputCls} sm:col-span-2`} aria-label="Source URL" />
        </div>
      </ApiForm>
    </details>
  );
}

export function PriceDraftForm({ treatmentId }: { treatmentId: string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-forest">New price version…</summary>
      <ApiForm
        url={`/api/admin/treatments/${treatmentId}/price-versions`}
        submitLabel="Create draft"
        transform={(fd) => ({
          currency: str(fd, "currency"),
          amountMinor: toMinor(str(fd, "amount")),
          minMinor: toMinor(str(fd, "min")),
          maxMinor: toMinor(str(fd, "max")),
          inclusions: optStr(fd, "inclusions"),
          exclusions: optStr(fd, "exclusions"),
          effectiveFrom: new Date(str(fd, "effectiveFrom") || Date.now()).toISOString(),
          effectiveTo: str(fd, "effectiveTo") ? new Date(str(fd, "effectiveTo")).toISOString() : null,
        })}
      >
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <select name="currency" className={inputCls} aria-label="Currency"><option>TRY</option><option>EUR</option><option>USD</option><option>GBP</option></select>
          <input name="amount" inputMode="decimal" placeholder="From price (e.g. 1500.00)" className={inputCls} aria-label="Single price" />
          <input name="min" inputMode="decimal" placeholder="or range min" className={inputCls} aria-label="Range minimum" />
          <input name="max" inputMode="decimal" placeholder="range max" className={inputCls} aria-label="Range maximum" />
          <input name="inclusions" placeholder="Includes…" className={`${inputCls} sm:col-span-2`} aria-label="Inclusions" />
          <input name="exclusions" placeholder="Excludes…" className={`${inputCls} sm:col-span-2`} aria-label="Exclusions" />
          <label className="text-xs text-muted">Effective from<input type="date" name="effectiveFrom" className={`${inputCls} block w-full`} /></label>
          <label className="text-xs text-muted">Effective to (optional)<input type="date" name="effectiveTo" className={`${inputCls} block w-full`} /></label>
        </div>
      </ApiForm>
    </details>
  );
}
