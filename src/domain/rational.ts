import { DomainValidationError } from "./errors";
import { normalizeDigits, pow10 } from "./money";

/** عدد گویا با bigint برای نرخ‌ها (مثلاً numeric(38,18)) بدون از دست رفتن دقت. */
export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};

export function rational(num: bigint, den: bigint = 1n): Rational {
  if (den === 0n) throw new DomainValidationError("INVALID_RATE", "مخرج صفر");
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den) || 1n;
  return { num: num / g, den: den / g };
}

/** «500000» یا «0.000002» یا «1.5» → Rational دقیق (حداکثر ۱۸ رقم اعشار). */
export function parseRational(value: string | bigint): Rational {
  if (typeof value === "bigint") return rational(value);
  const s = normalizeDigits(value)
    .trim()
    .replace(/[,_\s]/g, "");
  const m = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new DomainValidationError("INVALID_RATE", `مقدار نرخ نامعتبر: «${value}»`);
  const frac = m[3] ?? "";
  if (frac.length > 18) {
    throw new DomainValidationError("INVALID_RATE", "نرخ بیش از ۱۸ رقم اعشار دارد.");
  }
  const sign = m[1] === "-" ? -1n : 1n;
  return rational(sign * BigInt(m[2]! + frac), pow10(frac.length));
}

export const isPositive = (r: Rational): boolean => r.num > 0n;
export const rationalToString = (r: Rational): string => `${r.num}/${r.den}`;
