import { DomainValidationError } from "./errors";
import { sumMinor } from "./money";

/** تخصیص بهای جانبی واردات (حمل، بیمه، حقوق و عوارض، ترخیص) به اقلام. */
export type AllocationBasis = "VALUE" | "QUANTITY" | "WEIGHT" | "MANUAL";

export interface AllocationTarget {
  itemId: string;
  valueBaseMinor: bigint;
  quantity: bigint; // واحد صحیح (مثلاً گرم یا عدد × 1000)
  weight: bigint;
  manualShare?: bigint; // وزن دستی
}

/**
 * روش «بزرگ‌ترین باقی‌مانده» تا جمع تخصیص دقیقاً برابر مبلغ شود و هیچ ریالی گم نشود.
 * ترتیب برای باقی‌ماندهٔ مساوی بر اساس itemId ثابت است (deterministic).
 */
export function allocateCost(
  amountMinor: bigint,
  basis: AllocationBasis,
  targets: readonly AllocationTarget[],
): Map<string, bigint> {
  if (targets.length === 0)
    throw new DomainValidationError("ALLOCATION_INVALID", "هیچ قلمی برای تخصیص وجود ندارد.");
  if (amountMinor < 0n)
    throw new DomainValidationError("ALLOCATION_INVALID", "مبلغ تخصیص منفی است.");
  const weightOf = (t: AllocationTarget): bigint => {
    switch (basis) {
      case "VALUE":
        return t.valueBaseMinor;
      case "QUANTITY":
        return t.quantity;
      case "WEIGHT":
        return t.weight;
      case "MANUAL":
        return t.manualShare ?? 0n;
    }
  };
  const seen = new Set<string>();
  for (const t of targets) {
    if (seen.has(t.itemId))
      throw new DomainValidationError("ALLOCATION_INVALID", `قلم ${t.itemId} تکراری است.`, {
        itemId: t.itemId,
      });
    seen.add(t.itemId);
  }
  const weights = targets.map(weightOf);
  if (weights.some((w) => w < 0n))
    throw new DomainValidationError("ALLOCATION_INVALID", "مبنای تخصیص منفی است.");
  const total = sumMinor(weights);
  if (total === 0n)
    throw new DomainValidationError("ALLOCATION_INVALID", `جمع مبنای تخصیص (${basis}) صفر است.`);

  const parts = targets.map((t, i) => {
    const num = amountMinor * weights[i]!;
    return { id: t.itemId, base: num / total, rem: num % total };
  });
  let remaining = amountMinor - sumMinor(parts.map((p) => p.base));
  const order = [...parts].sort((a, b) =>
    b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.id < b.id ? -1 : 1,
  );
  const result = new Map(parts.map((p) => [p.id, p.base]));
  for (const p of order) {
    if (remaining === 0n) break;
    result.set(p.id, result.get(p.id)! + 1n);
    remaining -= 1n;
  }
  return result;
}
