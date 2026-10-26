import type { CurrencyRegistry } from "./currency";
import { DomainValidationError } from "./errors";
import { hashOf } from "./hash";
import type { RoundingMode } from "./money";
import { divRound, pow10 } from "./money";
import type { Rational } from "./rational";
import { parseRational, rational } from "./rational";

export type RateStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REVOKED";
export type RateTypeCode =
  | "ACCOUNTING"
  | "CUSTOMS"
  | "TAX"
  | "CONTRACT"
  | "BANK_BUY"
  | "BANK_SELL"
  | "SETTLEMENT"
  | "MANAGEMENT";

export interface RateType {
  code: RateTypeCode;
  permittedForPosting: boolean;
  requiresPolicyReference: boolean;
}

/**
 * نرخ با جهت صریح: baseUnits واحد از base برابر quoteUnits واحد از quote است.
 * مثال: base=USD, quote=IRR, baseUnits=1, quoteUnits=500000 → 1 USD = 500,000 IRR
 */
export interface ExchangeRate {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rateType: RateTypeCode;
  sourceId: string;
  baseUnits: string;
  quoteUnits: string;
  validFrom: string; // ISO
  validTo: string | null;
  status: RateStatus;
  approvedBy?: string | null;
}

export interface RateValidationOptions {
  at: string; // ISO datetime یا date
  rateTypes?: ReadonlyMap<RateTypeCode, RateType>;
  forPosting?: boolean;
}

export function validateRate(rate: ExchangeRate, opts: RateValidationOptions): void {
  if (rate.baseCurrency === rate.quoteCurrency) {
    throw new DomainValidationError("INVALID_RATE", "ارز پایه و مظنه نمی‌توانند یکسان باشند.");
  }
  const b = parseRational(rate.baseUnits);
  const q = parseRational(rate.quoteUnits);
  if (b.num <= 0n || q.num <= 0n) {
    throw new DomainValidationError("INVALID_RATE", "نرخ صفر یا منفی مجاز نیست.", {
      rateId: rate.id,
    });
  }
  if (rate.status !== "APPROVED") {
    throw new DomainValidationError(
      "RATE_NOT_APPROVED",
      `نرخ ${rate.id} در وضعیت ${rate.status} است.`,
    );
  }
  const at = Date.parse(opts.at);
  if (
    Date.parse(rate.validFrom) > at ||
    (rate.validTo !== null && Date.parse(rate.validTo) <= at)
  ) {
    throw new DomainValidationError(
      "RATE_NOT_EFFECTIVE",
      `نرخ ${rate.id} در تاریخ ${opts.at} معتبر نیست.`,
    );
  }
  if (opts.forPosting && opts.rateTypes) {
    const t = opts.rateTypes.get(rate.rateType);
    if (!t || !t.permittedForPosting) {
      throw new DomainValidationError(
        "RATE_TYPE_NOT_PERMITTED",
        `نوع نرخ ${rate.rateType} برای Posting مجاز نیست.`,
      );
    }
  }
}

/** quote برای یک واحد base به‌صورت گویا. */
export function quotePerBase(rate: Pick<ExchangeRate, "baseUnits" | "quoteUnits">): Rational {
  const b = parseRational(rate.baseUnits);
  const q = parseRational(rate.quoteUnits);
  return rational(q.num * b.den, q.den * b.num);
}

export interface FxConversionRequest {
  amountMinor: bigint;
  fromCurrency: string;
  toCurrency: string;
  rate: ExchangeRate;
  rounding: RoundingMode;
  policyVersion: string;
}

export interface FxConversionResult {
  sourceAmountMinor: bigint;
  targetAmountMinor: bigint;
  /** باقی‌ماندهٔ گردکردن در واحد minor مقصد، به‌صورت کسر دقیق (num/den). */
  residual: Rational;
  rateId: string;
  rateDirection: `${string}/${string}`;
  inverted: boolean;
  policyVersion: string;
}

/**
 * تبدیل Pure و deterministic. جهت از روی ارزها تعیین می‌شود؛ نرخ معکوس فقط محاسباتی است.
 * React یا UI هرگز نباید خودش تبدیل کند.
 */
export function convert(req: FxConversionRequest, registry: CurrencyRegistry): FxConversionResult {
  const from = registry.get(req.fromCurrency);
  const to = registry.get(req.toCurrency);
  const { rate } = req;
  let r: Rational;
  let inverted: boolean;
  if (rate.baseCurrency === from.code && rate.quoteCurrency === to.code) {
    r = quotePerBase(rate);
    inverted = false;
  } else if (rate.baseCurrency === to.code && rate.quoteCurrency === from.code) {
    const qpb = quotePerBase(rate);
    r = rational(qpb.den, qpb.num);
    inverted = true;
  } else {
    throw new DomainValidationError(
      "RATE_DIRECTION_MISMATCH",
      `نرخ ${rate.baseCurrency}/${rate.quoteCurrency} برای تبدیل ${from.code}→${to.code} مناسب نیست.`,
    );
  }
  // target_minor = amount_minor / 10^fromScale × r × 10^toScale
  const num = req.amountMinor * r.num * pow10(to.minorUnitScale);
  const den = r.den * pow10(from.minorUnitScale);
  const target = divRound(num, den, req.rounding);
  const residual = rational(num - target * den, den);
  return {
    sourceAmountMinor: req.amountMinor,
    targetAmountMinor: target,
    residual,
    rateId: rate.id,
    rateDirection: `${rate.baseCurrency}/${rate.quoteCurrency}`,
    inverted,
    policyVersion: req.policyVersion,
  };
}

export type SnapshotPurpose =
  "ACCOUNTING" | "CUSTOMS" | "TAX" | "SETTLEMENT" | "CONTRACT" | "REVALUATION";

export interface DocumentRateSnapshot {
  id: string;
  documentId: string;
  documentVersion: number;
  purpose: SnapshotPurpose;
  rateId: string;
  baseCurrency: string;
  quoteCurrency: string;
  baseUnits: string;
  quoteUnits: string;
  rateType: RateTypeCode;
  selectedAt: string;
  selectedBy: string | null;
  snapshotHash: string;
}

/** snapshot نرخ برای سند؛ سند Posted هرگز دوباره exchange_rates را query نمی‌کند. */
export function takeRateSnapshot(input: {
  id: string;
  documentId: string;
  documentVersion: number;
  purpose: SnapshotPurpose;
  rate: ExchangeRate;
  selectedAt: string;
  selectedBy: string | null;
}): DocumentRateSnapshot {
  const { rate } = input;
  const body = {
    documentId: input.documentId,
    documentVersion: input.documentVersion,
    purpose: input.purpose,
    rateId: rate.id,
    baseCurrency: rate.baseCurrency,
    quoteCurrency: rate.quoteCurrency,
    baseUnits: rate.baseUnits,
    quoteUnits: rate.quoteUnits,
    rateType: rate.rateType,
  };
  return Object.freeze({
    id: input.id,
    ...body,
    selectedAt: input.selectedAt,
    selectedBy: input.selectedBy,
    snapshotHash: hashOf(body),
  });
}

export function verifySnapshot(s: DocumentRateSnapshot): boolean {
  const { id, selectedAt, selectedBy, snapshotHash, ...body } = s;
  return hashOf(body) === snapshotHash;
}

/** نرخ snapshot را مانند ExchangeRate تأییدشده برای محاسبهٔ تاریخی برمی‌گرداند. */
export function snapshotAsRate(s: DocumentRateSnapshot): ExchangeRate {
  return {
    id: s.rateId,
    baseCurrency: s.baseCurrency,
    quoteCurrency: s.quoteCurrency,
    rateType: s.rateType,
    sourceId: "SNAPSHOT",
    baseUnits: s.baseUnits,
    quoteUnits: s.quoteUnits,
    validFrom: "1970-01-01T00:00:00Z",
    validTo: null,
    status: "APPROVED",
  };
}

/** انتخاب نرخ مؤثر: آخرین نرخ تأییدشده با نوع مشخص که در زمان «at» معتبر است. */
export function selectEffectiveRate(
  rates: readonly ExchangeRate[],
  q: { base: string; quote: string; rateType: RateTypeCode; at: string },
): ExchangeRate | null {
  const at = Date.parse(q.at);
  const candidates = rates.filter(
    (r) =>
      r.status === "APPROVED" &&
      r.rateType === q.rateType &&
      ((r.baseCurrency === q.base && r.quoteCurrency === q.quote) ||
        (r.baseCurrency === q.quote && r.quoteCurrency === q.base)) &&
      Date.parse(r.validFrom) <= at &&
      (r.validTo === null || Date.parse(r.validTo) > at),
  );
  candidates.sort((a, b) => Date.parse(b.validFrom) - Date.parse(a.validFrom));
  return candidates[0] ?? null;
}
