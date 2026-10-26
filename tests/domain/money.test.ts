import { describe, expect, test } from "bun:test";
import {
  DomainValidationError,
  divRound,
  formatMinor,
  parseDecimalToMinor,
  sha256Hex,
  addMoney,
  money,
} from "@/domain";

describe("Money — مقدار دقیق بدون float", () => {
  test("رشتهٔ اعشاری به minor", () => {
    expect(parseDecimalToMinor("1,234.56", 2)).toBe(123456n);
    expect(parseDecimalToMinor("۱۲۳٬۴۵۶", 0)).toBe(123456n);
    expect(parseDecimalToMinor("12٫5", 2)).toBe(1250n);
    expect(parseDecimalToMinor("-0.01", 2)).toBe(-1n);
    expect(parseDecimalToMinor("", 2)).toBe(0n);
  });

  test("0.1 + 0.2 دقیقاً 0.3 است", () => {
    const sum = parseDecimalToMinor(0.1, 2) + parseDecimalToMinor(0.2, 2);
    expect(sum).toBe(parseDecimalToMinor("0.3", 2));
    expect(0.1 + 0.2).not.toBe(0.3); // یادآوری خطای float
  });

  test("اعشار بیش از scale رد می‌شود (گردکردن پنهان ممنوع)", () => {
    expect(() => parseDecimalToMinor("1.005", 2)).toThrow(DomainValidationError);
    expect(parseDecimalToMinor("1.500", 2)).toBe(150n);
  });

  test("ورودی نامعتبر", () => {
    for (const bad of ["abc", "1.2.3", "--1", "."])
      expect(() => parseDecimalToMinor(bad, 2)).toThrow(DomainValidationError);
  });

  test("مبالغ بسیار بزرگ ریالی بدون از دست رفتن دقت", () => {
    const big = "987654321987654321987654321";
    expect(parseDecimalToMinor(big, 0).toString()).toBe(big);
    expect(formatMinor(123456789n, 2)).toBe("1,234,567.89");
    expect(formatMinor(-5n, 2)).toBe("-0.05");
  });

  test("سیاست‌های گردکردن", () => {
    expect(divRound(25n, 10n, "HALF_UP")).toBe(3n);
    expect(divRound(-25n, 10n, "HALF_UP")).toBe(-3n);
    expect(divRound(25n, 10n, "HALF_EVEN")).toBe(2n);
    expect(divRound(35n, 10n, "HALF_EVEN")).toBe(4n);
    expect(divRound(29n, 10n, "DOWN")).toBe(2n);
    expect(divRound(21n, 10n, "UP")).toBe(3n);
    expect(() => divRound(1n, 0n, "DOWN")).toThrow();
  });

  test("جمع دو ارز متفاوت ممنوع", () => {
    expect(() => addMoney(money("IRR", 1n, 0), money("USD", 1n, 2))).toThrow(DomainValidationError);
  });

  test("SHA-256 خالص با بردار استاندارد", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("حسابداری")).toHaveLength(64);
  });
});
