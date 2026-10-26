import { describe, expect, test } from "bun:test";
import {
  CurrencyRegistry,
  allocateCost,
  computeRevaluation,
  computeSettlementDifference,
  reconcile,
  rebuildProjection,
  takeRateSnapshot,
  trialBalance,
  totals,
} from "@/domain";
import type { OpenMonetaryItem } from "@/domain";
import { doc, usdIrr } from "./fixtures";

const reg = new CurrencyRegistry();

describe("دفاتر: Journal منبع حقیقت", () => {
  const posted = [
    doc({
      documentId: "a",
      status: "POSTED",
      lines: [
        {
          accountCode: "6101",
          subsidiaryCode: "01",
          detail1Code: "P-1",
          currencyCode: "IRR",
          debitBaseMinor: 100n,
          creditBaseMinor: 0n,
        },
        { accountCode: "1101", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 100n },
      ],
    }),
    doc({
      documentId: "b",
      status: "POSTED",
      lines: [
        {
          accountCode: "6101",
          subsidiaryCode: "01",
          detail2Code: "CC-9",
          currencyCode: "IRR",
          debitBaseMinor: 50n,
          creditBaseMinor: 0n,
        },
        { accountCode: "1101", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 50n },
      ],
    }),
    doc({ documentId: "draft", status: "DRAFT" }),
  ];

  test("بازسازی کل، معین و تفصیلی؛ پیش‌نویس اثری ندارد", () => {
    const p = rebuildProjection(posted);
    expect(p.get("GENERAL|c1|1405-08|6101")).toEqual({
      debitMinor: 150n,
      creditMinor: 0n,
      lineCount: 2,
    });
    expect(p.get("SUBSIDIARY|c1|1405-08|6101/01")?.debitMinor).toBe(150n);
    expect(p.get("DETAIL1|c1|1405-08|P-1")?.debitMinor).toBe(100n);
    expect(p.get("DETAIL2|c1|1405-08|CC-9")?.debitMinor).toBe(50n);
    const tb = trialBalance(p, "c1", "1405-08");
    expect(tb.reduce((s, r) => s + r.balanceMinor, 0n)).toBe(0n);
  });

  test("Reconciliation اختلاف را با hash کشف می‌کند و اصلاح خودکار نمی‌کند", () => {
    const expected = rebuildProjection(posted);
    const actual = rebuildProjection(posted);
    expect(reconcile(expected, actual).ok).toBe(true);
    actual.set("GENERAL|c1|1405-08|6101", { debitMinor: 149n, creditMinor: 0n, lineCount: 2 });
    const r = reconcile(expected, actual);
    expect(r.ok).toBe(false);
    expect(r.differences.map((d) => d.key)).toEqual(["GENERAL|c1|1405-08|6101"]);
    expect(r.expectedHash).not.toBe(r.actualHash);
    expect(expected.get("GENERAL|c1|1405-08|6101")!.debitMinor).toBe(150n);
  });
});

describe("تسعیر پایان دوره و تسویه", () => {
  const items: OpenMonetaryItem[] = [
    {
      itemId: "AP-1",
      accountCode: "2101",
      partyId: "sup-1",
      currencyCode: "USD",
      foreignBalanceMinor: -100_000n,
      carryingBaseMinor: -500_000_000n,
    }, // بدهی 1000 دلار با نرخ 500k
    {
      itemId: "BANK-1",
      accountCode: "1102",
      partyId: null,
      currencyCode: "USD",
      foreignBalanceMinor: 50_000n,
      carryingBaseMinor: 250_000_000n,
    },
  ];
  const closing = usdIrr({ id: "close-1", quoteUnits: "520000" });
  const snap = takeRateSnapshot({
    id: "snap-close",
    documentId: "rev-1",
    documentVersion: 1,
    purpose: "REVALUATION",
    rate: closing,
    selectedAt: "t",
    selectedBy: null,
  });
  const run = () =>
    computeRevaluation({
      companyId: "c1",
      fiscalPeriodId: "1405-08",
      valuationDate: "2026-11-21",
      baseCurrency: "IRR",
      closingRatePolicyVersion: "CLOSE-1",
      items,
      closingRates: new Map([["USD", closing]]),
      closingSnapshots: new Map([["USD", snap]]),
      accounts: { unrealizedGainAccount: "7101", unrealizedLossAccount: "8101" },
      rounding: "HALF_UP",
      registry: reg,
    });

  test("تفاوت تحقق‌نیافته جدا و سند متوازن", () => {
    const r = run();
    const ap = r.lines.find((l) => l.itemId === "AP-1")!;
    expect(ap.differenceBaseMinor).toBe(-20_000_000n);
    expect(ap.classification).toBe("UNREALIZED_LOSS");
    const bank = r.lines.find((l) => l.itemId === "BANK-1")!;
    expect(bank.differenceBaseMinor).toBe(10_000_000n);
    expect(bank.classification).toBe("UNREALIZED_GAIN");
    const t = totals(r.journalLines);
    expect(t.debit).toBe(t.credit);
    expect(
      r.journalLines
        .filter((l) => l.currencyCode === "USD")
        .every((l) => l.rateSnapshotId === "snap-close"),
    ).toBe(true);
  });

  test("اجرای دوباره idempotent است", () => {
    const a = run(),
      b = run();
    expect(a.runKey).toBe(b.runKey);
    expect(a.sourceBalanceHash).toBe(b.sourceBalanceHash);
    expect(a.journalLines).toEqual(b.journalLines);
  });

  test("تفاوت تحقق‌یافته در تسویه", () => {
    const payable = computeSettlementDifference({
      side: "PAYABLE",
      carryingBaseMinor: 500_000_000n,
      settledForeignMinor: 100_000n,
      currencyCode: "USD",
      baseCurrency: "IRR",
      settlementRate: usdIrr({ quoteUnits: "510000" }),
      rounding: "HALF_UP",
      policyVersion: "P1",
      registry: reg,
    });
    expect(payable).toEqual({
      settlementBaseMinor: 510_000_000n,
      differenceBaseMinor: -10_000_000n,
      classification: "REALIZED_LOSS",
    });
    const receivable = computeSettlementDifference({
      side: "RECEIVABLE",
      carryingBaseMinor: 500_000_000n,
      settledForeignMinor: 100_000n,
      currencyCode: "USD",
      baseCurrency: "IRR",
      settlementRate: usdIrr({ quoteUnits: "510000" }),
      rounding: "HALF_UP",
      policyVersion: "P1",
      registry: reg,
    });
    expect(receivable.classification).toBe("REALIZED_GAIN");
  });
});

describe("تخصیص بهای واردات", () => {
  const items = [
    { itemId: "A", valueBaseMinor: 1_000n, quantity: 1n, weight: 30n },
    { itemId: "B", valueBaseMinor: 2_000n, quantity: 1n, weight: 30n },
    { itemId: "C", valueBaseMinor: 3_000n, quantity: 1n, weight: 40n },
  ];
  test("جمع تخصیص دقیقاً برابر مبلغ (بدون گم‌شدن ریال)", () => {
    for (const basis of ["VALUE", "QUANTITY", "WEIGHT"] as const) {
      const r = allocateCost(1_000_001n, basis, items);
      expect([...r.values()].reduce((a, b) => a + b, 0n)).toBe(1_000_001n);
    }
    expect(Object.fromEntries(allocateCost(100n, "QUANTITY", items))).toEqual({
      A: 34n,
      B: 33n,
      C: 33n,
    });
    expect(Object.fromEntries(allocateCost(600n, "VALUE", items))).toEqual({
      A: 100n,
      B: 200n,
      C: 300n,
    });
  });
  test("مبنای صفر یا منفی رد می‌شود", () => {
    expect(() => allocateCost(10n, "MANUAL", items)).toThrow();
    expect(() =>
      allocateCost(10n, "VALUE", [{ itemId: "X", valueBaseMinor: -1n, quantity: 0n, weight: 0n }]),
    ).toThrow();
  });
});
