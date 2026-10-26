import { describe, expect, test } from "bun:test";
import {
  checkPostedLineEnrichment,
  isPostedStatus,
  validateLegacyLines,
} from "@/lib/legacy-journal-guard";

describe("کنترل سند در ساختار فعلی جدول (NUMERIC(18,2))", () => {
  test("توازن دقیق اعشاری", () => {
    expect(
      validateLegacyLines([
        { debit: 0.1, credit: 0 },
        { debit: 0.2, credit: 0 },
        { debit: 0, credit: 0.3 },
      ]),
    ).toBeNull();
    expect(
      validateLegacyLines([
        { debit: "1500000", credit: 0 },
        { debit: 0, credit: "1499999.99" },
      ]),
    ).toBe("جمع بدهکار و بستانکار سند برابر نیست.");
  });
  test("خطاهای سطر", () => {
    expect(validateLegacyLines([{ debit: 1, credit: 0 }])).toContain("دو سطر");
    expect(
      validateLegacyLines([
        { debit: 1, credit: 1 },
        { debit: 0, credit: 0 },
      ]),
    ).toContain("هم بدهکار و هم بستانکار");
    expect(
      validateLegacyLines([
        { debit: -1, credit: 0 },
        { debit: 0, credit: -1 },
      ]),
    ).toContain("منفی");
    expect(
      validateLegacyLines([
        { debit: 1.005, credit: 0 },
        { debit: 0, credit: 1.005 },
      ]),
    ).toContain("رقم اعشار");
  });
  test("وضعیت posted", () => {
    expect(isPostedStatus("posted")).toBe(true);
    expect(isPostedStatus("draft")).toBe(false);
  });
  test("سند Posted: فقط تکمیل معین/تفصیلی خالی", () => {
    const cur = {
      account_code: "6101",
      account_name: "هزینه",
      subsidiary_code: null,
      detail1_code: "P-1",
    };
    expect(
      checkPostedLineEnrichment(cur, { ...cur, subsidiary_code: "01", subsidiary_name: "اداری" }),
    ).toBeNull();
    expect(checkPostedLineEnrichment(cur, { ...cur, account_code: "6102" })).toContain("حساب کل");
    expect(checkPostedLineEnrichment(cur, { ...cur, detail1_code: "P-2" })).toContain(
      "تغییر مقدار موجود",
    );
  });
});
