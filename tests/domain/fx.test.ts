import { describe, expect, test } from "bun:test";
import {
  CurrencyRegistry,
  DomainValidationError,
  convert,
  defaultIranPolicy,
  inputToRialMinor,
  rialToTomanDisplay,
  selectEffectiveRate,
  snapshotAsRate,
  takeRateSnapshot,
  validateRate,
  verifySnapshot,
} from "@/domain";
import type { RateType, RateTypeCode } from "@/domain";
import { usdIrr } from "./fixtures";

const reg = new CurrencyRegistry();
const policy = defaultIranPolicy("c1");

describe("ریال/تومان", () => {
  test("۱ تومان = ۱۰ ریال و برگشت بدون از دست رفتن دقت", () => {
    expect(inputToRialMinor("1", "IRT", policy)).toBe(10n);
    expect(inputToRialMinor("۲۵۰٬۰۰۰", "IRT", policy)).toBe(2_500_000n);
    expect(rialToTomanDisplay(2_500_000n, policy)).toEqual({ toman: 250_000n, remainderRial: 0n });
    expect(rialToTomanDisplay(25n, policy)).toEqual({ toman: 2n, remainderRial: 5n });
  });

  test("IRT ارز دفترکل نیست", () => {
    expect(() => reg.assertLedgerCurrency("IRT")).toThrow(DomainValidationError);
    expect(reg.assertLedgerCurrency("IRR").code).toBe("IRR");
  });

  test("ورود تومان بدون Policy مجاز نیست", () => {
    expect(() => inputToRialMinor("1", "IRT", { ...policy, tomanInputEnabled: false })).toThrow(
      DomainValidationError,
    );
  });
});

describe("تبدیل ارز با جهت صریح", () => {
  test("USD → IRR", () => {
    const r = convert(
      {
        amountMinor: 12_345n,
        fromCurrency: "USD",
        toCurrency: "IRR",
        rate: usdIrr(),
        rounding: "HALF_UP",
        policyVersion: "P1",
      },
      reg,
    );
    expect(r.targetAmountMinor).toBe(61_725_000n); // 123.45 × 500,000
    expect(r.inverted).toBe(false);
    expect(r.rateDirection).toBe("USD/IRR");
  });

  test("IRR → USD با نرخ معکوس و residual", () => {
    const r = convert(
      {
        amountMinor: 1_000_003n,
        fromCurrency: "IRR",
        toCurrency: "USD",
        rate: usdIrr(),
        rounding: "HALF_UP",
        policyVersion: "P1",
      },
      reg,
    );
    expect(r.inverted).toBe(true);
    expect(r.targetAmountMinor).toBe(200n); // 2.00 USD
    expect(r.residual.num).not.toBe(0n);
  });

  test("نرخ کسری با ۱۸ رقم اعشار", () => {
    const rate = usdIrr({
      baseCurrency: "EUR",
      quoteCurrency: "USD",
      baseUnits: "1",
      quoteUnits: "1.083456789012345678",
      id: "eur",
    });
    const r = convert(
      {
        amountMinor: 100_000n,
        fromCurrency: "EUR",
        toCurrency: "USD",
        rate,
        rounding: "HALF_EVEN",
        policyVersion: "P1",
      },
      reg,
    );
    expect(r.targetAmountMinor).toBe(108_346n);
  });

  test("رفت و برگشت مبالغ کوچک: باقی‌مانده صریح است", () => {
    const rate = usdIrr();
    for (const amount of [1n, 3n, 7n, 499_999n]) {
      const toUsd = convert(
        {
          amountMinor: amount,
          fromCurrency: "IRR",
          toCurrency: "USD",
          rate,
          rounding: "DOWN",
          policyVersion: "P1",
        },
        reg,
      );
      const back = convert(
        {
          amountMinor: toUsd.targetAmountMinor,
          fromCurrency: "USD",
          toCurrency: "IRR",
          rate,
          rounding: "DOWN",
          policyVersion: "P1",
        },
        reg,
      );
      expect(back.targetAmountMinor <= amount).toBe(true);
    }
  });

  test("نرخ با جهت نامرتبط رد می‌شود", () => {
    expect(() =>
      convert(
        {
          amountMinor: 1n,
          fromCurrency: "EUR",
          toCurrency: "IRR",
          rate: usdIrr(),
          rounding: "HALF_UP",
          policyVersion: "P1",
        },
        reg,
      ),
    ).toThrow(DomainValidationError);
  });
});

describe("اعتبار نرخ", () => {
  const types = new Map<RateTypeCode, RateType>([
    [
      "ACCOUNTING",
      { code: "ACCOUNTING", permittedForPosting: true, requiresPolicyReference: true },
    ],
    ["CUSTOMS", { code: "CUSTOMS", permittedForPosting: false, requiresPolicyReference: true }],
  ]);
  const at = "2026-10-27T10:00:00Z";

  test("نرخ معتبر", () =>
    expect(() => validateRate(usdIrr(), { at, rateTypes: types, forPosting: true })).not.toThrow());
  test("صفر/منفی", () => {
    expect(() => validateRate(usdIrr({ quoteUnits: "0" }), { at })).toThrow(/صفر یا منفی/);
    expect(() => validateRate(usdIrr({ quoteUnits: "-1" }), { at })).toThrow(DomainValidationError);
  });
  test("revoked/draft", () => {
    expect(() => validateRate(usdIrr({ status: "REVOKED" }), { at })).toThrow(
      expect.objectContaining({ code: "RATE_NOT_APPROVED" }),
    );
  });
  test("منقضی یا آینده", () => {
    expect(() => validateRate(usdIrr({ validTo: "2026-10-20T00:00:00Z" }), { at })).toThrow(
      expect.objectContaining({ code: "RATE_NOT_EFFECTIVE" }),
    );
    expect(() => validateRate(usdIrr({ validFrom: "2026-11-01T00:00:00Z" }), { at })).toThrow(
      expect.objectContaining({ code: "RATE_NOT_EFFECTIVE" }),
    );
  });
  test("نوع نرخ گمرکی برای Posting مجاز نیست", () => {
    expect(() =>
      validateRate(usdIrr({ rateType: "CUSTOMS" }), { at, rateTypes: types, forPosting: true }),
    ).toThrow(expect.objectContaining({ code: "RATE_TYPE_NOT_PERMITTED" }));
  });
  test("انتخاب نرخ مؤثر بر اساس تاریخ", () => {
    const rates = [
      usdIrr({ id: "old", validTo: "2026-10-25T00:00:00Z" }),
      usdIrr({ id: "new", validFrom: "2026-10-25T00:00:00Z", quoteUnits: "520000" }),
      usdIrr({ id: "revoked", validFrom: "2026-10-26T00:00:00Z", status: "REVOKED" }),
    ];
    expect(
      selectEffectiveRate(rates, { base: "USD", quote: "IRR", rateType: "ACCOUNTING", at })?.id,
    ).toBe("new");
    expect(
      selectEffectiveRate(rates, {
        base: "USD",
        quote: "IRR",
        rateType: "ACCOUNTING",
        at: "2026-10-10T00:00:00Z",
      })?.id,
    ).toBe("old");
  });
});

describe("Snapshot نرخ در سند", () => {
  test("نرخ آینده سند گذشته را تغییر نمی‌دهد", () => {
    const original = usdIrr();
    const snap = takeRateSnapshot({
      id: "s1",
      documentId: "d1",
      documentVersion: 3,
      purpose: "ACCOUNTING",
      rate: original,
      selectedAt: "2026-10-27T08:00:00Z",
      selectedBy: "u1",
    });
    // نرخ امروز تغییر می‌کند
    original.quoteUnits = "600000";
    const r = convert(
      {
        amountMinor: 100n,
        fromCurrency: "USD",
        toCurrency: "IRR",
        rate: snapshotAsRate(snap),
        rounding: "HALF_UP",
        policyVersion: "P1",
      },
      reg,
    );
    expect(r.targetAmountMinor).toBe(500_000n);
    expect(verifySnapshot(snap)).toBe(true);
    expect(Object.isFrozen(snap)).toBe(true);
  });
  test("دست‌کاری snapshot کشف می‌شود", () => {
    const snap = {
      ...takeRateSnapshot({
        id: "s1",
        documentId: "d1",
        documentVersion: 1,
        purpose: "ACCOUNTING",
        rate: usdIrr(),
        selectedAt: "x",
        selectedBy: null,
      }),
    };
    snap.quoteUnits = "1";
    expect(verifySnapshot(snap)).toBe(false);
  });
});
