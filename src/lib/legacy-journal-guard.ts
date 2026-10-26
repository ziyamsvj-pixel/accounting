import { DomainValidationError, parseDecimalToMinor, sumMinor } from "@/domain";

/**
 * پل بین جدول فعلی journal_lines (NUMERIC(18,2)) و Domain دقیق.
 * تا تصویب Migration جدید، کنترل‌ها روی ساختار فعلی و با مبلغ bigint (scale=2) انجام می‌شود.
 */
export const LEGACY_SCALE = 2;

export function toLegacyMinor(value: number | string | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  return parseDecimalToMinor(typeof value === "number" ? value : String(value), LEGACY_SCALE);
}

export interface LegacyLineAmounts {
  debit: number | string | null | undefined;
  credit: number | string | null | undefined;
}

/** برمی‌گرداند پیام خطای فارسی یا null. فقط قواعد قطعی؛ هشدارها جای دیگری بررسی می‌شوند. */
export function validateLegacyLines(lines: readonly LegacyLineAmounts[]): string | null {
  if (lines.length < 2) return "هر سند باید دست‌کم دو سطر داشته باشد.";
  let debits: bigint[];
  let credits: bigint[];
  try {
    debits = lines.map((l) => toLegacyMinor(l.debit));
    credits = lines.map((l) => toLegacyMinor(l.credit));
  } catch (e) {
    if (e instanceof DomainValidationError) return e.message;
    throw e;
  }
  for (let i = 0; i < lines.length; i++) {
    const d = debits[i]!;
    const c = credits[i]!;
    if (d < 0n || c < 0n) return `سطر ${i + 1}: مبلغ منفی مجاز نیست.`;
    if (d > 0n && c > 0n) return `سطر ${i + 1}: یک سطر نمی‌تواند هم بدهکار و هم بستانکار باشد.`;
    if (d === 0n && c === 0n) return `سطر ${i + 1}: مبلغ ندارد.`;
  }
  if (sumMinor(debits) !== sumMinor(credits)) return "جمع بدهکار و بستانکار سند برابر نیست.";
  return null;
}

export const isPostedStatus = (status: string | null | undefined): boolean =>
  (status ?? "").toLowerCase() === "posted";

type ClassificationFields = {
  subsidiary_code?: string | null;
  subsidiary_name?: string | null;
  detail1_code?: string | null;
  detail1_name?: string | null;
  detail2_code?: string | null;
  detail2_name?: string | null;
};

/**
 * برای سند Posted فقط «تکمیل» طبقه‌بندی خالی (معین/تفصیلی) مجاز است؛ تغییر حساب کل یا
 * بازنویسی مقدار موجود ممنوع است و باید با سند برگشتی انجام شود.
 */
export function checkPostedLineEnrichment(
  current: ClassificationFields & { account_code: string; account_name: string },
  next: ClassificationFields & { account_code: string; account_name: string },
): string | null {
  if (current.account_code !== next.account_code || current.account_name !== next.account_name) {
    return "حساب کل سند ثبت‌قطعی‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی ثبت کنید.";
  }
  const keys: (keyof ClassificationFields)[] = [
    "subsidiary_code",
    "subsidiary_name",
    "detail1_code",
    "detail1_name",
    "detail2_code",
    "detail2_name",
  ];
  for (const k of keys) {
    const before = (current[k] ?? "").trim();
    const after = (next[k] ?? "").trim();
    if (before !== "" && before !== after) {
      return "در سند ثبت‌قطعی‌شده فقط تکمیل معین/تفصیلی خالی مجاز است، نه تغییر مقدار موجود.";
    }
  }
  return null;
}
