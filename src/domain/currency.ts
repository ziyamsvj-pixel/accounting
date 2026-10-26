import { DomainValidationError } from "./errors";
import type { RoundingMode } from "./money";
import { divRound, parseDecimalToMinor, pow10 } from "./money";

export interface CurrencyDefinition {
  code: string;
  displayName: string;
  /** تعداد رقم اعشار واحد کوچک (ریال: ۰، دلار: ۲). */
  minorUnitScale: number;
  isLegalTender: boolean;
  /** ارز فقط نمایشی/ورودی؛ مجاز برای دفترکل نیست (IRT). */
  isDisplayOnly: boolean;
  isActive: boolean;
}

/** فهرست پایه؛ فهرست نهایی باید از جدول currencies و تأیید مالی بیاید. */
export const DEFAULT_CURRENCIES: Readonly<Record<string, CurrencyDefinition>> = Object.freeze({
  IRR: {
    code: "IRR",
    displayName: "ریال",
    minorUnitScale: 0,
    isLegalTender: true,
    isDisplayOnly: false,
    isActive: true,
  },
  IRT: {
    code: "IRT",
    displayName: "تومان",
    minorUnitScale: 0,
    isLegalTender: false,
    isDisplayOnly: true,
    isActive: true,
  },
  USD: {
    code: "USD",
    displayName: "دلار آمریکا",
    minorUnitScale: 2,
    isLegalTender: false,
    isDisplayOnly: false,
    isActive: true,
  },
  EUR: {
    code: "EUR",
    displayName: "یورو",
    minorUnitScale: 2,
    isLegalTender: false,
    isDisplayOnly: false,
    isActive: true,
  },
  AED: {
    code: "AED",
    displayName: "درهم امارات",
    minorUnitScale: 2,
    isLegalTender: false,
    isDisplayOnly: false,
    isActive: true,
  },
  CNY: {
    code: "CNY",
    displayName: "یوان چین",
    minorUnitScale: 2,
    isLegalTender: false,
    isDisplayOnly: false,
    isActive: true,
  },
});

export class CurrencyRegistry {
  private readonly byCode: Map<string, CurrencyDefinition>;

  constructor(defs: Iterable<CurrencyDefinition> = Object.values(DEFAULT_CURRENCIES)) {
    this.byCode = new Map([...defs].map((d) => [d.code, d]));
  }

  get(code: string): CurrencyDefinition {
    const def = this.byCode.get(code);
    if (!def || !def.isActive) {
      throw new DomainValidationError("UNKNOWN_CURRENCY", `ارز ناشناخته یا غیرفعال: ${code}`);
    }
    return def;
  }

  assertLedgerCurrency(code: string): CurrencyDefinition {
    const def = this.get(code);
    if (def.isDisplayOnly) {
      throw new DomainValidationError(
        "DISPLAY_ONLY_CURRENCY",
        `${code} فقط برای ورود/نمایش است و نمی‌تواند ارز دفترکل باشد.`,
      );
    }
    return def;
  }
}

/** Policy ارز شرکت؛ نسخه‌دار. تغییر آن اسناد گذشته را عوض نمی‌کند. */
export interface CompanyCurrencyPolicy {
  companyId: string;
  policyVersion: string;
  functionalCurrencyCode: string; // معمولاً IRR
  presentationCurrencyCode: string;
  defaultInputCurrencyCode: string;
  tomanInputEnabled: boolean;
  tomanToRialNumerator: bigint; // پیش‌فرض 10
  tomanToRialDenominator: bigint; // پیش‌فرض 1
  roundingMode: RoundingMode;
}

export function defaultIranPolicy(companyId: string): CompanyCurrencyPolicy {
  return {
    companyId,
    policyVersion: "IR-DEFAULT-1",
    functionalCurrencyCode: "IRR",
    presentationCurrencyCode: "IRR",
    defaultInputCurrencyCode: "IRR",
    tomanInputEnabled: true,
    tomanToRialNumerator: 10n,
    tomanToRialDenominator: 1n,
    roundingMode: "HALF_UP",
  };
}

/**
 * نسبت تومان به ریال از دادهٔ نسخه‌دار می‌آید و قابل اعتماد فرض نمی‌شود:
 * صورت و مخرج باید مثبت و «ریال به‌ازای هر تومان» عدد صحیح باشد تا تبدیل هرگز گرد نشود.
 */
export function assertTomanPolicyRatio(policy: CompanyCurrencyPolicy): bigint {
  const n = policy.tomanToRialNumerator;
  const d = policy.tomanToRialDenominator;
  if (n <= 0n || d <= 0n || n % d !== 0n) {
    throw new DomainValidationError(
      "INVALID_RATE",
      `نسبت تومان به ریال در Policy ${policy.policyVersion} نامعتبر است (${n}/${d}).`,
      { policyVersion: policy.policyVersion },
    );
  }
  return n / d;
}

/** ورودی کاربر (ریال یا تومان) → ریال در minor. تبدیل تومان فقط اگر Policy اجازه دهد. */
export function inputToRialMinor(
  amount: string | number,
  inputCurrency: "IRR" | "IRT",
  policy: CompanyCurrencyPolicy,
): bigint {
  if (inputCurrency === "IRR") return parseDecimalToMinor(amount, 0);
  if (!policy.tomanInputEnabled) {
    throw new DomainValidationError(
      "DISPLAY_ONLY_CURRENCY",
      "ورود مبلغ به تومان در Policy این شرکت فعال نیست.",
    );
  }
  const rialPerToman = assertTomanPolicyRatio(policy);
  return parseDecimalToMinor(amount, 0) * rialPerToman;
}

/** ریال → تومان برای نمایش؛ باقی‌مانده (کسر تومان) برگردانده می‌شود تا پنهان نماند. */
export function rialToTomanDisplay(
  rialMinor: bigint,
  policy: CompanyCurrencyPolicy,
): { toman: bigint; remainderRial: bigint } {
  const rialPerToman = assertTomanPolicyRatio(policy);
  const toman = divRound(rialMinor, rialPerToman, "DOWN");
  return { toman, remainderRial: rialMinor - toman * rialPerToman };
}

export const minorFactor = (def: CurrencyDefinition): bigint => pow10(def.minorUnitScale);
