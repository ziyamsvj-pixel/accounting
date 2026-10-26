import { DomainValidationError } from "./errors";

/**
 * مقدار پولی دقیق: همیشه bigint در کوچک‌ترین واحد (minor) + ارز + scale.
 * هیچ‌جا از number/float برای مبلغ استفاده نمی‌شود.
 */
export interface Money {
  readonly currency: string;
  readonly minor: bigint;
  readonly scale: number;
}

export type RoundingMode = "HALF_UP" | "HALF_EVEN" | "DOWN" | "UP";

export const pow10 = (n: number): bigint => 10n ** BigInt(n);

export function money(currency: string, minor: bigint, scale: number): Money {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new DomainValidationError("INVALID_AMOUNT_FORMAT", `scale نامعتبر: ${scale}`);
  }
  return { currency, minor, scale };
}

/**
 * تبدیل رشتهٔ اعشاری (با ارقام فارسی/عربی، جداکنندهٔ هزارگان و ممیز فارسی) به minor.
 * اگر تعداد ارقام اعشار از scale بیشتر باشد، خطای قطعی می‌دهد (گردکردن پنهان ممنوع).
 */
export function parseDecimalToMinor(input: string | number | bigint, scale: number): bigint {
  if (typeof input === "bigint") return input * pow10(scale);
  let s = typeof input === "number" ? numberToPlainString(input) : input;
  s = normalizeDigits(s)
    .trim()
    .replace(/[,\s_\u066C\u2009\u202F]/g, "")
    .replace(/\u066B/g, ".");
  if (s === "") return 0n;
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] === undefined || m[3] === ""))) {
    throw new DomainValidationError("INVALID_AMOUNT_FORMAT", `مبلغ نامعتبر: «${String(input)}»`);
  }
  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = m[2] || "0";
  let frac = (m[3] ?? "").replace(/0+$/, "");
  if (frac.length > scale) {
    throw new DomainValidationError(
      "AMOUNT_PRECISION_EXCEEDED",
      `مبلغ «${String(input)}» بیش از ${scale} رقم اعشار دارد.`,
    );
  }
  frac = frac.padEnd(scale, "0");
  return sign * BigInt(intPart + frac);
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) {
    throw new DomainValidationError("INVALID_AMOUNT_FORMAT", `مبلغ نامعتبر: ${n}`);
  }
  // اعداد ورودی UI معمولاً کوچک‌اند؛ برای جلوگیری از نماد علمی:
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

export function normalizeDigits(s: string): string {
  return s
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function formatMinor(minor: bigint, scale: number): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const s = abs.toString().padStart(scale + 1, "0");
  const int = s.slice(0, s.length - scale) || "0";
  const frac = scale > 0 ? s.slice(s.length - scale) : "";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

/** تقسیم صحیح با سیاست گردکردن صریح. den باید مثبت باشد. */
export function divRound(num: bigint, den: bigint, mode: RoundingMode): bigint {
  if (den === 0n) throw new DomainValidationError("INVALID_RATE", "تقسیم بر صفر");
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const q = num / den; // به سمت صفر
  const r = num % den;
  if (r === 0n) return q;
  const sign = num < 0n ? -1n : 1n;
  const absR2 = (r < 0n ? -r : r) * 2n;
  switch (mode) {
    case "DOWN":
      return q;
    case "UP":
      return q + sign;
    case "HALF_UP":
      return absR2 >= den ? q + sign : q;
    case "HALF_EVEN":
      if (absR2 > den) return q + sign;
      if (absR2 < den) return q;
      return q % 2n === 0n ? q : q + sign;
  }
}

export function sumMinor(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { ...a, minor: a.minor + b.minor };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { ...a, minor: a.minor - b.minor };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency || a.scale !== b.scale) {
    throw new DomainValidationError(
      "CURRENCY_MISMATCH",
      `جمع دو مبلغ با ارز/scale متفاوت مجاز نیست: ${a.currency}/${a.scale} و ${b.currency}/${b.scale}`,
    );
  }
}
