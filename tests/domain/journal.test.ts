import { describe, expect, test } from "bun:test";
import {
  CurrencyRegistry,
  assertPostable,
  checkPostingInvariants,
  computeContentHash,
} from "@/domain";
import type { PostingContext } from "@/domain";
import { accounts, doc, openPeriod } from "./fixtures";

const ctx = (o: Partial<PostingContext> = {}): PostingContext => ({
  period: openPeriod,
  accounts,
  currencies: new CurrencyRegistry(),
  rateSnapshotIds: new Set(),
  ...o,
});
const codes = (d = doc(), c = ctx()) => checkPostingInvariants(d, c).map((v) => v.code);

describe("قواعد قطعی Posting", () => {
  test("سند سالم قابل Post است", () => {
    expect(codes()).toEqual([]);
    expect(() => assertPostable(doc(), ctx())).not.toThrow();
  });
  test("عدم توازن", () => {
    const d = doc({
      lines: [
        { accountCode: "6101", currencyCode: "IRR", debitBaseMinor: 100n, creditBaseMinor: 0n },
        { accountCode: "1101", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 99n },
      ],
    });
    expect(codes(d)).toContain("UNBALANCED_ENTRY");
  });
  test("کمتر از دو سطر", () => expect(codes(doc({ lines: [] }))).toContain("MINIMUM_LINES"));
  test("حساب گروهی، ناشناخته و غیرفعال", () => {
    const d = doc({
      lines: [
        { accountCode: "1000", currencyCode: "IRR", debitBaseMinor: 10n, creditBaseMinor: 0n },
        { accountCode: "4242", currencyCode: "IRR", debitBaseMinor: 10n, creditBaseMinor: 0n },
        { accountCode: "9999", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 20n },
      ],
    });
    expect(codes(d)).toEqual(
      expect.arrayContaining(["GROUP_ACCOUNT_POSTING", "UNKNOWN_ACCOUNT", "INACTIVE_ACCOUNT"]),
    );
  });
  test("سطر دوطرفه، منفی و صفر", () => {
    const d = doc({
      lines: [
        { accountCode: "6101", currencyCode: "IRR", debitBaseMinor: 10n, creditBaseMinor: 10n },
        { accountCode: "6101", currencyCode: "IRR", debitBaseMinor: -5n, creditBaseMinor: 0n },
        { accountCode: "1101", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 0n },
      ],
    });
    expect(codes(d)).toEqual(
      expect.arrayContaining(["BOTH_SIDES_ON_LINE", "NEGATIVE_AMOUNT", "ZERO_LINE"]),
    );
  });
  test("دورهٔ بسته، نیمه‌بسته و تاریخ خارج از دوره", () => {
    expect(codes(doc(), ctx({ period: { ...openPeriod, status: "CLOSED" } }))).toContain(
      "PERIOD_CLOSED",
    );
    expect(codes(doc(), ctx({ period: { ...openPeriod, status: "SOFT_CLOSED" } }))).toContain(
      "PERIOD_CLOSED",
    );
    expect(
      codes(
        doc(),
        ctx({ period: { ...openPeriod, status: "SOFT_CLOSED" }, allowSoftClosed: true }),
      ),
    ).toEqual([]);
    expect(codes(doc({ entryDate: "2026-12-01" }))).toContain("DATE_OUTSIDE_PERIOD");
    expect(codes(doc(), ctx({ period: null }))).toContain("PERIOD_NOT_FOUND");
    expect(codes(doc(), ctx({ period: { ...openPeriod, companyId: "other" } }))).toContain(
      "PERIOD_COMPANY_MISMATCH",
    );
  });
  test("فقط سند APPROVED", () => {
    for (const status of ["DRAFT", "SUBMITTED", "POSTED", "REVERSED"] as const)
      expect(codes(doc({ status }))).toContain("INVALID_DOCUMENT_STATUS");
  });
  test("ارز تومان در سطر ممنوع؛ سطر ارزی بدون snapshot ممنوع", () => {
    const irt = doc({
      lines: [
        { accountCode: "6101", currencyCode: "IRT", debitBaseMinor: 10n, creditBaseMinor: 0n },
        { accountCode: "1101", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 10n },
      ],
    });
    expect(codes(irt)).toContain("DISPLAY_ONLY_CURRENCY");
    const usd = doc({
      lines: [
        {
          accountCode: "1102",
          currencyCode: "USD",
          foreignAmountMinor: 100n,
          debitBaseMinor: 500_000n,
          creditBaseMinor: 0n,
          rateSnapshotId: "snap-1",
        },
        { accountCode: "1101", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 500_000n },
      ],
    });
    expect(codes(usd)).toContain("FOREIGN_LINE_MISSING_RATE");
    expect(codes(usd, ctx({ rateSnapshotIds: new Set(["snap-1"]) }))).toEqual([]);
  });
  test("ارز پایهٔ IRT برای سند ممنوع", () =>
    expect(codes(doc({ baseCurrency: "IRT", lines: [] }))).toContain("DISPLAY_ONLY_CURRENCY"));
  test("hash محتوا پایدار و حساس به تغییر", () => {
    expect(computeContentHash(doc())).toBe(computeContentHash(doc()));
    expect(computeContentHash(doc())).not.toBe(computeContentHash(doc({ description: "تغییر" })));
    expect(computeContentHash(doc())).toBe(
      computeContentHash(doc({ status: "POSTED", version: 1 })),
    );
  });
});
