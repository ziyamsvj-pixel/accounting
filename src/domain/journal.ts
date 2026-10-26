import type { CurrencyRegistry } from "./currency";
import type { DomainViolation } from "./errors";
import { DomainValidationError } from "./errors";
import { hashOf } from "./hash";
import { sumMinor } from "./money";

export type DocumentStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REVERSED";
export type DocumentType =
  | "JOURNAL"
  | "PURCHASE_INVOICE"
  | "EXPENSE"
  | "PAYMENT"
  | "RECEIPT"
  | "FX_REVALUATION"
  | "REVERSAL";
export type AccountType = "GROUP" | "LEDGER";

/** مرز سازمانی: Tenant ⊃ Company ⊃ Branch ⊃ Counter (باجه). */
export interface OrgScope {
  tenantId: string;
  companyId: string;
  branchId: string | null;
  counterId?: string | null;
}

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  level: "GENERAL" | "SUBSIDIARY" | "DETAIL";
  isActive: boolean;
  /** اگر حساب ارزی است؛ null یعنی فقط ارز عملکردی. */
  currencyCode: string | null;
  isMonetary: boolean;
}

export interface JournalLine {
  accountCode: string;
  subsidiaryCode?: string | null;
  detail1Code?: string | null;
  detail2Code?: string | null;
  description?: string | null;
  /** ارز معامله در سطر؛ برای سطر ریالی برابر ارز عملکردی. */
  currencyCode: string;
  /** مبلغ ارزی (minor ارز سطر)؛ برای سطر ارزی الزامی. */
  foreignAmountMinor?: bigint | null;
  /** مبالغ همیشه در ارز عملکردی (پایه) و minor. */
  debitBaseMinor: bigint;
  creditBaseMinor: bigint;
  rateSnapshotId?: string | null;
  roundingResidualBaseMinor?: bigint;
  partyId?: string | null;
  costCenterId?: string | null;
}

export interface JournalDocument {
  scope: OrgScope;
  documentId: string;
  documentType: DocumentType;
  /** شمارهٔ موقت در Draft؛ شمارهٔ قطعی هنگام Post در Company/دوره تخصیص می‌یابد. */
  draftNumber: string;
  documentNumber: string | null;
  version: number;
  status: DocumentStatus;
  fiscalPeriodId: string;
  entryDate: string; // YYYY-MM-DD
  description: string | null;
  baseCurrency: string;
  lines: readonly JournalLine[];
  attachmentIds: readonly string[];
  sourceReference: string | null;
  idempotencyKey: string;
  createdBy: string;
  createdAt: string;
  submittedBy?: string | null;
  approvedBy?: string | null;
  postedBy?: string | null;
  postedAt?: string | null;
  contentHash?: string | null;
  reversalOfId?: string | null;
  reversedById?: string | null;
}

export interface FiscalPeriod {
  id: string;
  companyId: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "SOFT_CLOSED" | "CLOSED";
}

export interface PostingContext {
  period: FiscalPeriod | null;
  accounts: ReadonlyMap<string, Account>;
  currencies: CurrencyRegistry;
  /** شناسهٔ snapshotهای موجود برای این سند و نسخه. */
  rateSnapshotIds: ReadonlySet<string>;
  /** اجازهٔ Post در دورهٔ SOFT_CLOSED (مثلاً برای مدیر مالی). */
  allowSoftClosed?: boolean;
}

export function totals(lines: readonly JournalLine[]): { debit: bigint; credit: bigint } {
  return {
    debit: sumMinor(lines.map((l) => l.debitBaseMinor)),
    credit: sumMinor(lines.map((l) => l.creditBaseMinor)),
  };
}

/**
 * تمام قواعد قطعی Posting. جمع‌ها از سطرها محاسبه می‌شوند، نه از ورودی کاربر.
 * خروجی خالی یعنی سند قابل Post است.
 */
export function checkPostingInvariants(
  doc: JournalDocument,
  ctx: PostingContext,
): DomainViolation[] {
  const v: DomainViolation[] = [];
  if (doc.status !== "APPROVED") {
    v.push({
      code: "INVALID_DOCUMENT_STATUS",
      message: `فقط سند تأییدشده قابل ثبت قطعی است (وضعیت فعلی: ${doc.status}).`,
    });
  }
  v.push(...checkLineInvariants(doc, ctx));

  const p = ctx.period;
  if (!p) {
    v.push({ code: "PERIOD_NOT_FOUND", message: "دورهٔ مالی سند یافت نشد." });
  } else {
    if (p.id !== doc.fiscalPeriodId || p.companyId !== doc.scope.companyId) {
      v.push({
        code: "PERIOD_COMPANY_MISMATCH",
        message: "دورهٔ مالی متعلق به این شرکت/سند نیست.",
      });
    }
    if (p.status === "CLOSED" || (p.status === "SOFT_CLOSED" && !ctx.allowSoftClosed)) {
      v.push({ code: "PERIOD_CLOSED", message: "دورهٔ مالی بسته است." });
    }
    if (doc.entryDate < p.startDate || doc.entryDate > p.endDate) {
      v.push({
        code: "DATE_OUTSIDE_PERIOD",
        message: `تاریخ سند ${doc.entryDate} خارج از دورهٔ ${p.startDate} تا ${p.endDate} است.`,
      });
    }
  }
  return v;
}

/** قواعد سطر و توازن؛ برای Draft هم قابل استفاده است (به‌صورت هشدار در UI). */
export function checkLineInvariants(
  doc: Pick<JournalDocument, "lines" | "baseCurrency">,
  ctx: Pick<PostingContext, "accounts" | "currencies" | "rateSnapshotIds">,
): DomainViolation[] {
  const v: DomainViolation[] = [];
  if (doc.lines.length < 2)
    v.push({ code: "MINIMUM_LINES", message: "سند باید دست‌کم دو سطر داشته باشد." });

  try {
    ctx.currencies.assertLedgerCurrency(doc.baseCurrency);
  } catch (e) {
    v.push({
      code: e instanceof DomainValidationError ? e.code : "UNKNOWN_CURRENCY",
      message: (e as Error).message,
    });
  }

  doc.lines.forEach((l, i) => {
    if (l.debitBaseMinor < 0n || l.creditBaseMinor < 0n) {
      v.push({
        code: "NEGATIVE_AMOUNT",
        message: `سطر ${i + 1}: مبلغ منفی مجاز نیست.`,
        lineIndex: i,
      });
    }
    if (l.debitBaseMinor > 0n && l.creditBaseMinor > 0n) {
      v.push({
        code: "BOTH_SIDES_ON_LINE",
        message: `سطر ${i + 1}: هم بدهکار و هم بستانکار دارد.`,
        lineIndex: i,
      });
    }
    if (l.debitBaseMinor === 0n && l.creditBaseMinor === 0n) {
      v.push({ code: "ZERO_LINE", message: `سطر ${i + 1}: مبلغ ندارد.`, lineIndex: i });
    }
    const acc = ctx.accounts.get(l.accountCode);
    if (!acc) {
      v.push({
        code: "UNKNOWN_ACCOUNT",
        message: `سطر ${i + 1}: حساب ${l.accountCode} در کدینگ نیست.`,
        lineIndex: i,
      });
    } else {
      if (acc.type === "GROUP")
        v.push({
          code: "GROUP_ACCOUNT_POSTING",
          message: `سطر ${i + 1}: حساب گروهی ${acc.code} محل ثبت مستقیم نیست.`,
          lineIndex: i,
        });
      if (!acc.isActive)
        v.push({
          code: "INACTIVE_ACCOUNT",
          message: `سطر ${i + 1}: حساب ${acc.code} غیرفعال است.`,
          lineIndex: i,
        });
    }
    let lineCurrencyOk = true;
    try {
      ctx.currencies.assertLedgerCurrency(l.currencyCode);
    } catch (e) {
      lineCurrencyOk = false;
      v.push({
        code: e instanceof DomainValidationError ? e.code : "UNKNOWN_CURRENCY",
        message: `سطر ${i + 1}: ${(e as Error).message}`,
        lineIndex: i,
      });
    }
    if (lineCurrencyOk && l.currencyCode !== doc.baseCurrency) {
      if (
        l.foreignAmountMinor == null ||
        !l.rateSnapshotId ||
        !ctx.rateSnapshotIds.has(l.rateSnapshotId)
      ) {
        v.push({
          code: "FOREIGN_LINE_MISSING_RATE",
          message: `سطر ${i + 1}: سطر ارزی باید مبلغ ارزی و snapshot نرخ معتبر داشته باشد.`,
          lineIndex: i,
        });
      }
    }
  });

  const t = totals(doc.lines);
  if (t.debit !== t.credit) {
    v.push({
      code: "UNBALANCED_ENTRY",
      message: `جمع بدهکار (${t.debit}) و بستانکار (${t.credit}) برابر نیست.`,
    });
  }
  return v;
}

export function assertPostable(doc: JournalDocument, ctx: PostingContext): void {
  const v = checkPostingInvariants(doc, ctx);
  if (v.length > 0) {
    throw new DomainValidationError(v[0]!.code, v.map((x) => x.message).join(" | "), {
      violations: v,
    });
  }
}

/** hash محتوای حسابداری سند (بدون فیلدهای چرخهٔ کار) برای کشف تغییر پس از Post. */
export function computeContentHash(doc: JournalDocument): string {
  return hashOf({
    scope: doc.scope,
    documentId: doc.documentId,
    documentType: doc.documentType,
    documentNumber: doc.documentNumber,
    version: doc.version,
    fiscalPeriodId: doc.fiscalPeriodId,
    entryDate: doc.entryDate,
    baseCurrency: doc.baseCurrency,
    description: doc.description,
    lines: doc.lines,
    attachmentIds: doc.attachmentIds,
    sourceReference: doc.sourceReference,
    reversalOfId: doc.reversalOfId ?? null,
  });
}
