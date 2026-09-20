import type { Rule } from "@/lib/compliance.functions";
import type { EntryWithLines } from "@/lib/accounting.functions";

export type CheckOutcome = "pass" | "attention" | "fail" | "manual";

export type CheckResult = {
  rule: Rule;
  outcome: CheckOutcome;
  message: string;
};

export const OUTCOME_FA: Record<CheckOutcome, string> = {
  pass: "منطبق",
  attention: "نیازمند توجه",
  fail: "مغایر",
  manual: "بررسی دستی",
};

function totals(entry: EntryWithLines) {
  const debit = entry.journal_lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const credit = entry.journal_lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  return { debit, credit, amount: Math.max(debit, credit) };
}

function hasAccountLike(entry: EntryWithLines, needles: string[]) {
  return entry.journal_lines.some((l) =>
    needles.some(
      (n) => l.account_name.includes(n) || l.account_code.toLowerCase().includes(n.toLowerCase()),
    ),
  );
}

/** آستانه‌های نمونه — پیش از استفادهٔ عملی باید با متن رسمی راستی‌آزمایی شوند. */
const CASH_LIMIT = 100_000_000;

export function evaluateEntry(entry: EntryWithLines, rules: Rule[]): CheckResult[] {
  const { debit, credit, amount } = totals(entry);

  return rules.map((rule) => {
    const r = (outcome: CheckOutcome, message: string): CheckResult => ({
      rule,
      outcome,
      message,
    });

    switch (rule.domain) {
      case "accounting_standards": {
        if (Math.round((debit - credit) * 100) !== 0) {
          return r("fail", "جمع بدهکار و بستانکار سند برابر نیست؛ اصل ثبت دوطرفه رعایت نشده است.");
        }
        if (!entry.description || entry.description.trim().length < 5) {
          return r("attention", "شرح سند کوتاه یا خالی است؛ برای مستندسازی کافی نیست.");
        }
        return r("pass", "سند متوازن است و شرح دارد.");
      }
      case "auditing": {
        const noLineDesc = entry.journal_lines.some((l) => !l.description);
        if (!entry.document_number) return r("fail", "سند شمارهٔ رسمی ندارد.");
        if (noLineDesc) return r("attention", "برخی سطرها شرح ندارند؛ رد پای حسابرسی ناقص است.");
        return r("pass", "شماره سند و شرح سطرها موجود است.");
      }
      case "vat": {
        if (hasAccountLike(entry, ["ارزش افزوده", "مالیات بر ارزش", "VAT"])) {
          return r("pass", "سطر مالیات بر ارزش افزوده در سند ثبت شده است.");
        }
        if (hasAccountLike(entry, ["فروش", "درآمد", "خرید"])) {
          return r(
            "attention",
            "سند فروش یا خرید دارد اما سطر مالیات بر ارزش افزوده در آن دیده نمی‌شود.",
          );
        }
        return r("manual", "این سند ماهیت مشمول ارزش افزوده ندارد؛ بررسی دستی کافی است.");
      }
      case "withholding": {
        if (hasAccountLike(entry, ["حقوق", "پیمان", "اجاره", "خدمات"])) {
          if (hasAccountLike(entry, ["تکلیفی", "کسر", "مالیات حقوق"])) {
            return r("pass", "سطر کسر تکلیفی در سند ثبت شده است.");
          }
          return r("attention", "ماهیت سند مشمول کسر تکلیفی است اما سطر آن ثبت نشده است.");
        }
        return r("manual", "مشمول کسر تکلیفی به نظر نمی‌رسد؛ بررسی دستی کافی است.");
      }
      case "moadian": {
        if (amount >= CASH_LIMIT) {
          return r(
            "attention",
            "مبلغ سند بالاست؛ در صورت فروش، ارسال صورتحساب به سامانه مؤدیان لازم است.",
          );
        }
        return r("manual", "ارسال به سامانه مؤدیان باید بر پایهٔ نوع صورتحساب بررسی شود.");
      }
      case "direct_tax": {
        if (hasAccountLike(entry, ["هزینه"]) && (!entry.description || amount >= CASH_LIMIT)) {
          return r(
            "attention",
            "هزینهٔ سنگین یا بدون شرح؛ برای قابل قبول بودن مالیاتی نیاز به مستندات دارد.",
          );
        }
        if (hasAccountLike(entry, ["هزینه"])) {
          return r("pass", "هزینه دارای شرح است و در محدودهٔ عادی ثبت شده است.");
        }
        return r("manual", "این سند هزینه‌ای نیست؛ بررسی دستی کافی است.");
      }
      default:
        return r("manual", "برای این قاعده ارزیابی خودکار تعریف نشده است.");
    }
  });
}

export function summarize(results: CheckResult[]) {
  return {
    fail: results.filter((x) => x.outcome === "fail").length,
    attention: results.filter((x) => x.outcome === "attention").length,
    pass: results.filter((x) => x.outcome === "pass").length,
    manual: results.filter((x) => x.outcome === "manual").length,
  };
}
