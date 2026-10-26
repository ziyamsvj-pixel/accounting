import type { JournalDocument } from "@/domain/journal";
import { totals } from "@/domain/journal";
import type { LedgerTotals } from "@/domain/ledger";
import type { Agent, AgentFinding, AgentRunContext } from "./types";

const NEEDS_ATTACHMENT: ReadonlySet<JournalDocument["documentType"]> = new Set([
  "PURCHASE_INVOICE",
  "EXPENSE",
  "PAYMENT",
]);

/** کنترل حسابداری: کامل‌بودن سند، پیوست، ارز سطر، شرح. همه غیرمسدودکننده. */
export class AccountingReviewAgent implements Agent {
  readonly name = "accounting-review";
  readonly version = "1.0.0";

  async review({ subject: { document: d } }: AgentRunContext): Promise<AgentFinding[]> {
    const out: AgentFinding[] = [];
    if (d.attachmentIds.length === 0 && NEEDS_ATTACHMENT.has(d.documentType)) {
      out.push({
        code: "MISSING_SUPPORTING_ATTACHMENT",
        severity: "WARNING",
        confidence: 0.99,
        title: "پیوست پشتیبان ثبت نشده است",
        explanation: "برای این نوع سند، پیوست فاکتور/رسید یا توضیح دلیل نبود پیوست لازم است.",
        evidence: [{ field: "attachmentIds", observedValue: 0, source: "DOCUMENT" }],
        suggestedActions: [
          { code: "ADD_ATTACHMENT", label: "افزودن فاکتور یا رسید", requiresHumanApproval: false },
        ],
        sourceRefs: [],
        expiresAt: null,
      });
    }
    const foreign = d.lines.filter((l) => l.currencyCode !== d.baseCurrency);
    if (foreign.length > 0 && !d.lines.some((l) => l.rateSnapshotId)) {
      out.push({
        code: "FOREIGN_LINES_WITHOUT_RATE_CONTEXT",
        severity: "WARNING",
        confidence: 0.98,
        title: "سطر ارزی بدون نرخ",
        explanation:
          "برای سطر ارزی باید نرخ و snapshot آن انتخاب شود؛ در غیر این صورت Posting متوقف خواهد شد.",
        evidence: [
          {
            field: "lines.currencyCode",
            observedValue: foreign[0]!.currencyCode,
            expectedValue: d.baseCurrency,
            source: "DOCUMENT",
          },
        ],
        suggestedActions: [
          { code: "SELECT_RATE", label: "انتخاب نرخ حسابداری", requiresHumanApproval: true },
        ],
        sourceRefs: [],
        expiresAt: null,
      });
    }
    if (!d.description || d.description.trim().length < 5) {
      out.push({
        code: "MISSING_DESCRIPTION",
        severity: "INFO",
        confidence: 1,
        title: "شرح سند ناقص است",
        explanation: "شرح روشن به حسابرسی و پیگیری کمک می‌کند.",
        evidence: [
          { field: "description", observedValue: d.description ?? null, source: "DOCUMENT" },
        ],
        suggestedActions: [
          { code: "ADD_DESCRIPTION", label: "تکمیل شرح", requiresHumanApproval: false },
        ],
        sourceRefs: [],
        expiresAt: null,
      });
    }
    return out;
  }
}

/** بررسی پیوست/OCR: همسانی شناسهٔ فروشنده و مبلغ فاکتور با سند. */
export class DocumentReviewAgent implements Agent {
  readonly name = "document-ocr-review";
  readonly version = "1.0.0";
  constructor(private readonly minConfidence = 0.6) {}

  async review({ subject }: AgentRunContext): Promise<AgentFinding[]> {
    const out: AgentFinding[] = [];
    const d = subject.document;
    for (const o of subject.ocr ?? []) {
      if (o.confidence < this.minConfidence) {
        out.push({
          code: "OCR_LOW_CONFIDENCE",
          severity: "INFO",
          confidence: o.confidence,
          title: "کیفیت خوانش پیوست پایین است",
          explanation: "نتیجهٔ OCR برای مقایسه قابل اتکا نیست؛ بررسی چشمی پیشنهاد می‌شود.",
          evidence: [
            {
              field: "ocr.confidence",
              observedValue: o.confidence,
              source: "OCR",
              locator: o.attachmentId,
            },
          ],
          suggestedActions: [
            { code: "MANUAL_REVIEW", label: "بررسی چشمی پیوست", requiresHumanApproval: false },
          ],
          sourceRefs: [],
          expiresAt: null,
        });
        continue;
      }
      if (
        subject.declaredVendorNationalId &&
        o.vendorNationalId &&
        o.vendorNationalId !== subject.declaredVendorNationalId
      ) {
        out.push({
          code: "VENDOR_ID_MISMATCH",
          severity: "HIGH_RISK",
          confidence: o.confidence,
          title: "شناسهٔ فروشنده با فاکتور همسان نیست",
          explanation: "شناسهٔ ملی فروشنده در سند با شناسهٔ خوانده‌شده از فاکتور تفاوت دارد.",
          evidence: [
            {
              field: "vendorNationalId",
              observedValue: subject.declaredVendorNationalId,
              expectedValue: o.vendorNationalId,
              source: "OCR",
              locator: o.attachmentId,
            },
          ],
          suggestedActions: [
            { code: "VERIFY_VENDOR", label: "بررسی طرف حساب", requiresHumanApproval: true },
          ],
          sourceRefs: [],
          expiresAt: null,
        });
      }
      if (o.totalMinor != null) {
        const t = totals(d.lines).debit;
        if (o.totalMinor !== t) {
          out.push({
            code: "INVOICE_TOTAL_MISMATCH",
            severity: "WARNING",
            confidence: o.confidence,
            title: "مبلغ فاکتور با سند برابر نیست",
            explanation: "جمع سند با مبلغ کل فاکتور خوانده‌شده تفاوت دارد.",
            evidence: [
              {
                field: "total",
                observedValue: t.toString(),
                expectedValue: o.totalMinor.toString(),
                source: "OCR",
                locator: o.attachmentId,
              },
            ],
            suggestedActions: [
              { code: "RECHECK_AMOUNT", label: "بازبینی مبلغ", requiresHumanApproval: true },
            ],
            sourceRefs: [],
            expiresAt: null,
          });
        }
      }
    }
    return out;
  }
}

export interface RulePackReader {
  /** قواعد مؤثر در تاریخ سند؛ فقط قواعد با منبع رسمی تأییدشده. */
  rulesFor(
    documentType: string,
    entryDate: string,
  ): Promise<
    {
      ruleId: string;
      title: string;
      sourceRef: {
        sourceId: string;
        title: string;
        url?: string;
        article?: string;
        effectiveFrom?: string;
      };
      check: (d: JournalDocument) => string | null;
    }[]
  >;
}

/** انطباق مقرراتی: خروجی همیشه اخطار است؛ قطعیت مالیاتی را AI اعلام نمی‌کند. */
export class ComplianceReviewAgent implements Agent {
  readonly name = "compliance-review";
  readonly version = "1.0.0";
  constructor(private readonly rules?: RulePackReader) {}

  async review({ subject: { document: d } }: AgentRunContext): Promise<AgentFinding[]> {
    if (!NEEDS_ATTACHMENT.has(d.documentType)) return [];
    const rules = this.rules ? await this.rules.rulesFor(d.documentType, d.entryDate) : [];
    if (rules.length === 0) {
      return [
        {
          code: "TAX_SOURCE_REVIEW_REQUIRED",
          severity: "INFO",
          confidence: null,
          title: "بررسی مقرراتی نیازمند تأیید منبع است",
          explanation:
            "Rule Pack تأییدشده‌ای برای این نوع سند و تاریخ وجود ندارد؛ ایجنت شمول مالیاتی را قطعی اعلام نمی‌کند.",
          evidence: [{ field: "documentType", observedValue: d.documentType, source: "DOCUMENT" }],
          suggestedActions: [
            {
              code: "OPEN_RULE_REVIEW",
              label: "بازکردن Rule Pack و منبع رسمی",
              requiresHumanApproval: true,
            },
          ],
          sourceRefs: [],
          expiresAt: null,
        },
      ];
    }
    const out: AgentFinding[] = [];
    for (const r of rules) {
      const msg = r.check(d);
      if (msg)
        out.push({
          code: `RULE_${r.ruleId}`,
          severity: "WARNING",
          confidence: null,
          title: r.title,
          explanation: msg,
          evidence: [{ field: "rule", observedValue: r.ruleId, source: "RULE" }],
          suggestedActions: [
            { code: "REVIEW_RULE", label: "بررسی قاعده و منبع", requiresHumanApproval: true },
          ],
          sourceRefs: [r.sourceRef],
          expiresAt: null,
        });
    }
    return out;
  }
}

export interface LedgerIntegrityReader {
  /** جمع ذخیره‌شده در Read Model دفتر. */
  projectionTotals(
    companyId: string,
    fiscalPeriodId: string,
    accountCode: string,
  ): Promise<LedgerTotals>;
  /** جمع بازسازی‌شده از کل Journal همان دوره (منبع حقیقت). */
  journalTotals(
    companyId: string,
    fiscalPeriodId: string,
    accountCode: string,
  ): Promise<LedgerTotals>;
}

/**
 * کنترل دفتر: Read Model را با بازسازی از کل Journal همان حساب/دوره مقایسه می‌کند
 * (اصلاح نسخهٔ نمونه که جمع کل دوره را با سطرهای یک سند مقایسه می‌کرد). اصلاح خودکار انجام نمی‌دهد.
 */
export class LedgerIntegrityAgent implements Agent {
  readonly name = "ledger-integrity";
  readonly version = "1.1.0";
  constructor(private readonly ledger: LedgerIntegrityReader) {}

  async review({ subject: { document: d } }: AgentRunContext): Promise<AgentFinding[]> {
    if (d.status !== "POSTED" && d.status !== "REVERSED") return [];
    const out: AgentFinding[] = [];
    for (const code of [...new Set(d.lines.map((l) => l.accountCode))].sort()) {
      const [expected, actual] = await Promise.all([
        this.ledger.journalTotals(d.scope.companyId, d.fiscalPeriodId, code),
        this.ledger.projectionTotals(d.scope.companyId, d.fiscalPeriodId, code),
      ]);
      if (
        expected.debitMinor !== actual.debitMinor ||
        expected.creditMinor !== actual.creditMinor
      ) {
        out.push({
          code: "LEDGER_PROJECTION_MISMATCH",
          severity: "HIGH_RISK",
          confidence: 1,
          title: `اختلاف Journal و دفتر برای حساب ${code}`,
          explanation:
            "Read Model باید از Journal قابل بازسازی باشد؛ این اختلاف نیازمند بررسی فنی است.",
          evidence: [
            {
              field: `account:${code}.debit`,
              observedValue: actual.debitMinor.toString(),
              expectedValue: expected.debitMinor.toString(),
              source: "LEDGER",
            },
            {
              field: `account:${code}.credit`,
              observedValue: actual.creditMinor.toString(),
              expectedValue: expected.creditMinor.toString(),
              source: "LEDGER",
            },
          ],
          suggestedActions: [
            {
              code: "REBUILD_PROJECTION",
              label: "بازسازی Read Model پس از بررسی",
              requiresHumanApproval: true,
            },
          ],
          sourceRefs: [],
          expiresAt: null,
        });
      }
    }
    return out;
  }
}

export interface HistoryReader {
  /** مبالغ بدهکار سطرهای Posted گذشتهٔ همین حساب (برای آستانهٔ ناهنجاری). */
  recentAmounts(companyId: string, accountCode: string, limit: number): Promise<bigint[]>;
  /** اسناد مشابه (همان مبلغ کل و طرف حساب) در بازهٔ روز اخیر. */
  similarDocuments(
    companyId: string,
    totalMinor: bigint,
    partyId: string | null,
    aroundDate: string,
    days: number,
    excludeId: string,
  ): Promise<{ documentId: string; entryDate: string }[]>;
}

/** ناهنجاری: مبلغ غیرعادی نسبت به میانهٔ تاریخچه و احتمال ثبت تکراری. */
export class AnomalyReviewAgent implements Agent {
  readonly name = "anomaly-review";
  readonly version = "1.0.0";
  constructor(
    private readonly history: HistoryReader,
    private readonly multiplier = 10n,
    private readonly minSamples = 5,
  ) {}

  async review({ subject: { document: d } }: AgentRunContext): Promise<AgentFinding[]> {
    const out: AgentFinding[] = [];
    for (const l of d.lines) {
      if (l.debitBaseMinor === 0n) continue;
      const hist = await this.history.recentAmounts(d.scope.companyId, l.accountCode, 50);
      if (hist.length < this.minSamples) continue;
      const sorted = [...hist].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const median = sorted[Math.floor(sorted.length / 2)]!;
      if (median > 0n && l.debitBaseMinor > median * this.multiplier) {
        out.push({
          code: "UNUSUAL_AMOUNT",
          severity: "WARNING",
          confidence: 0.7,
          title: `مبلغ غیرعادی برای حساب ${l.accountCode}`,
          explanation: `مبلغ سطر بیش از ${this.multiplier} برابر میانهٔ تاریخچهٔ این حساب است.`,
          evidence: [
            {
              field: "debitBaseMinor",
              observedValue: l.debitBaseMinor.toString(),
              expectedValue: median.toString(),
              source: "HISTORY",
            },
          ],
          suggestedActions: [
            { code: "CONFIRM_AMOUNT", label: "تأیید مبلغ", requiresHumanApproval: true },
          ],
          sourceRefs: [],
          expiresAt: null,
        });
      }
    }
    const t = totals(d.lines).debit;
    const party = d.lines.find((l) => l.partyId)?.partyId ?? null;
    const dup = await this.history.similarDocuments(
      d.scope.companyId,
      t,
      party,
      d.entryDate,
      7,
      d.documentId,
    );
    if (dup.length > 0) {
      out.push({
        code: "POSSIBLE_DUPLICATE",
        severity: "HIGH_RISK",
        confidence: 0.8,
        title: "احتمال ثبت تکراری",
        explanation: "سند دیگری با همان مبلغ و طرف حساب در ۷ روز اخیر وجود دارد.",
        evidence: dup.map((x) => ({
          field: "similarDocument",
          observedValue: x.documentId,
          source: "HISTORY" as const,
          locator: x.entryDate,
        })),
        suggestedActions: [
          { code: "COMPARE_DOCUMENTS", label: "مقایسهٔ اسناد", requiresHumanApproval: true },
        ],
        sourceRefs: [],
        expiresAt: null,
      });
    }
    return out;
  }
}
