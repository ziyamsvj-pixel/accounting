import type { CurrencyRegistry } from "./currency";
import { DomainValidationError } from "./errors";
import type { DocumentRateSnapshot, ExchangeRate } from "./fx";
import { convert, validateRate } from "./fx";
import { hashOf } from "./hash";
import type { JournalLine } from "./journal";
import type { RoundingMode } from "./money";

/** قلم پولی باز (مثلاً حساب پرداختنی ارزی یک تأمین‌کننده). */
export interface OpenMonetaryItem {
  itemId: string;
  accountCode: string;
  partyId: string | null;
  currencyCode: string;
  /** مانده ارزی؛ مثبت = بدهکار (دارایی)، منفی = بستانکار (بدهی). */
  foreignBalanceMinor: bigint;
  /** ارزش دفتری فعلی به ارز پایه با همان علامت. */
  carryingBaseMinor: bigint;
}

export type FxGainLossClass =
  "UNREALIZED_GAIN" | "UNREALIZED_LOSS" | "REALIZED_GAIN" | "REALIZED_LOSS";

export interface RevaluationLine {
  itemId: string;
  accountCode: string;
  partyId: string | null;
  currencyCode: string;
  priorBookBaseMinor: bigint;
  closingValueBaseMinor: bigint;
  differenceBaseMinor: bigint;
  classification: "UNREALIZED_GAIN" | "UNREALIZED_LOSS";
  rateId: string;
}

export interface RevaluationAccounts {
  unrealizedGainAccount: string;
  unrealizedLossAccount: string;
}

export interface RevaluationRun {
  runKey: string; // idempotency: company + period + date + policy
  companyId: string;
  fiscalPeriodId: string;
  valuationDate: string;
  closingRatePolicyVersion: string;
  lines: RevaluationLine[];
  journalLines: JournalLine[];
  sourceBalanceHash: string;
}

export function revaluationRunKey(
  companyId: string,
  fiscalPeriodId: string,
  valuationDate: string,
  policyVersion: string,
): string {
  return `FXREV|${companyId}|${fiscalPeriodId}|${valuationDate}|${policyVersion}`;
}

/**
 * بازسنجی پایان دوره (تسعیر تحقق‌نیافته). Pure و idempotent: ورودی یکسان → خروجی یکسان.
 * سند حاصل یک Journal مستقل است که باید چرخهٔ عادی تأیید/Post را طی کند.
 */
export function computeRevaluation(input: {
  companyId: string;
  fiscalPeriodId: string;
  valuationDate: string;
  baseCurrency: string;
  closingRatePolicyVersion: string;
  items: readonly OpenMonetaryItem[];
  closingRates: ReadonlyMap<string, ExchangeRate>; // currency → rate
  closingSnapshots: ReadonlyMap<string, DocumentRateSnapshot>; // currency → snapshot
  accounts: RevaluationAccounts;
  rounding: RoundingMode;
  registry: CurrencyRegistry;
}): RevaluationRun {
  const lines: RevaluationLine[] = [];
  const journalLines: JournalLine[] = [];
  const ids = new Set<string>();
  for (const it of input.items) {
    if (ids.has(it.itemId))
      throw new DomainValidationError("REVALUATION_INVALID", `قلم ${it.itemId} تکراری است.`, {
        itemId: it.itemId,
      });
    ids.add(it.itemId);
  }
  const sorted = [...input.items].sort((a, b) =>
    a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0,
  );
  const validated = new Set<string>();
  for (const item of sorted) {
    const rate = input.closingRates.get(item.currencyCode);
    if (!rate)
      throw new DomainValidationError(
        "RATE_NOT_EFFECTIVE",
        `نرخ پایان دوره برای ${item.currencyCode} موجود نیست.`,
      );
    if (!validated.has(item.currencyCode)) {
      // نرخ Draft، باطل‌شده یا خارج از تاریخ ارزیابی نباید مبلغ تسعیر بسازد.
      validateRate(rate, { at: input.valuationDate });
      validated.add(item.currencyCode);
    }
    const snap = input.closingSnapshots.get(item.currencyCode);
    const closing = convert(
      {
        amountMinor: item.foreignBalanceMinor,
        fromCurrency: item.currencyCode,
        toCurrency: input.baseCurrency,
        rate,
        rounding: input.rounding,
        policyVersion: input.closingRatePolicyVersion,
      },
      input.registry,
    ).targetAmountMinor;
    const diff = closing - item.carryingBaseMinor;
    if (diff === 0n) continue;
    if (
      !snap ||
      snap.rateId !== rate.id ||
      snap.baseUnits !== rate.baseUnits ||
      snap.quoteUnits !== rate.quoteUnits
    ) {
      throw new DomainValidationError(
        "FOREIGN_LINE_MISSING_RATE",
        `snapshot نرخ پایان دوره برای ${item.currencyCode} موجود نیست یا با نرخ ${rate.id} نمی‌خواند.`,
        { currencyCode: item.currencyCode, rateId: rate.id, snapshotId: snap?.id ?? null },
      );
    }
    const classification = diff > 0n ? "UNREALIZED_GAIN" : "UNREALIZED_LOSS";
    lines.push({
      itemId: item.itemId,
      accountCode: item.accountCode,
      partyId: item.partyId,
      currencyCode: item.currencyCode,
      priorBookBaseMinor: item.carryingBaseMinor,
      closingValueBaseMinor: closing,
      differenceBaseMinor: diff,
      classification,
      rateId: rate.id,
    });
    const abs = diff > 0n ? diff : -diff;
    // سطر قلم پولی: فقط ارزش پایه تغییر می‌کند؛ مبلغ ارزی صفر است.
    journalLines.push({
      accountCode: item.accountCode,
      currencyCode: item.currencyCode,
      foreignAmountMinor: 0n,
      debitBaseMinor: diff > 0n ? abs : 0n,
      creditBaseMinor: diff < 0n ? abs : 0n,
      rateSnapshotId: snap.id,
      partyId: item.partyId,
      description: `تسعیر ${item.currencyCode} - ${item.itemId}`,
    });
    journalLines.push({
      accountCode:
        diff > 0n ? input.accounts.unrealizedGainAccount : input.accounts.unrealizedLossAccount,
      currencyCode: input.baseCurrency,
      debitBaseMinor: diff < 0n ? abs : 0n,
      creditBaseMinor: diff > 0n ? abs : 0n,
      description:
        classification === "UNREALIZED_GAIN" ? "سود تسعیر تحقق‌نیافته" : "زیان تسعیر تحقق‌نیافته",
    });
  }
  return {
    runKey: revaluationRunKey(
      input.companyId,
      input.fiscalPeriodId,
      input.valuationDate,
      input.closingRatePolicyVersion,
    ),
    companyId: input.companyId,
    fiscalPeriodId: input.fiscalPeriodId,
    valuationDate: input.valuationDate,
    closingRatePolicyVersion: input.closingRatePolicyVersion,
    lines,
    journalLines,
    sourceBalanceHash: hashOf(sorted),
  };
}

/**
 * تفاوت تحقق‌یافته هنگام تسویه: (ارزش تسویه به نرخ روز پرداخت) − (ارزش دفتری).
 * برای بدهی (مثلاً پرداخت به تأمین‌کننده)، ارزش تسویهٔ بیشتر = زیان.
 */
export function computeSettlementDifference(input: {
  side: "RECEIVABLE" | "PAYABLE";
  carryingBaseMinor: bigint; // مثبت
  settledForeignMinor: bigint; // مثبت
  currencyCode: string;
  baseCurrency: string;
  settlementRate: ExchangeRate;
  rounding: RoundingMode;
  policyVersion: string;
  registry: CurrencyRegistry;
}): {
  settlementBaseMinor: bigint;
  differenceBaseMinor: bigint;
  classification: "REALIZED_GAIN" | "REALIZED_LOSS" | null;
} {
  const settlementBase = convert(
    {
      amountMinor: input.settledForeignMinor,
      fromCurrency: input.currencyCode,
      toCurrency: input.baseCurrency,
      rate: input.settlementRate,
      rounding: input.rounding,
      policyVersion: input.policyVersion,
    },
    input.registry,
  ).targetAmountMinor;
  const raw = settlementBase - input.carryingBaseMinor;
  const signed = input.side === "RECEIVABLE" ? raw : -raw;
  return {
    settlementBaseMinor: settlementBase,
    differenceBaseMinor: signed,
    classification: signed === 0n ? null : signed > 0n ? "REALIZED_GAIN" : "REALIZED_LOSS",
  };
}
