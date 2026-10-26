/*
 * نمونهٔ آموزشی — برای اجرا در محیط تولید نیست.
 *
 * هدف:
 * 1) جداسازی خطاهای قطعی Domain از اخطارهای تحلیلی AI؛
 * 2) اجرای چند ایجنت به‌صورت هم‌زمان؛
 * 3) ثبت evidence، منبع، confidence و نسخهٔ سند؛
 * 4) جلوگیری از تغییر مستقیم سند Posted توسط ایجنت.
 */

export type Severity = "INFO" | "WARNING" | "HIGH_RISK" | "BLOCKING";
export type FindingStatus = "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED" | "ESCALATED";

export interface Evidence {
  field: string;
  observedValue: string | number | null;
  expectedValue?: string | number | null;
  source: "DOCUMENT" | "ATTACHMENT" | "LEDGER" | "RULE" | "HISTORY";
  locator?: string;
}

export interface SourceRef {
  sourceId: string;
  title: string;
  url?: string;
  article?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

export interface SuggestedAction {
  code: string;
  label: string;
  requiresHumanApproval: boolean;
}

export interface DocumentSnapshot {
  tenantId: string;
  companyId: string;
  branchId: string | null;
  documentId: string;
  documentVersion: number;
  documentType: "PURCHASE_INVOICE" | "EXPENSE" | "PAYMENT" | "RECEIPT" | "JOURNAL";
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "LOCKED" | "REVERSED";
  fiscalPeriodId: string;
  entryDate: string;
  currencyCode: string;
  baseCurrencyCode: string;
  totalDebitMinor: bigint;
  totalCreditMinor: bigint;
  lines: Array<{
    accountCode: string;
    accountType: "GROUP" | "LEDGER";
    debitMinor: bigint;
    creditMinor: bigint;
    currencyCode: string;
    detailCode?: string | null;
  }>;
  attachmentIds: string[];
  sourceReference?: string | null;
}

export interface AgentRunContext {
  runId: string;
  eventId: string;
  correlationId: string;
  rulesetVersion: string;
  snapshot: DocumentSnapshot;
}

export interface AgentFinding {
  code: string;
  severity: Severity;
  /** اخطار تحلیلی پیش‌فرض false است؛ فقط Domain می‌تواند آن را blocking کند. */
  blocking: boolean;
  confidence: number | null;
  title: string;
  explanation: string;
  evidence: Evidence[];
  suggestedActions: SuggestedAction[];
  sourceRefs: SourceRef[];
  dedupeKey: string;
  expiresAt: string | null;
}

export interface PersistedFinding extends AgentFinding {
  findingId: string;
  runId: string;
  documentId: string;
  documentVersion: number;
  status: FindingStatus;
  createdAt: string;
}

export interface Agent<TOutput = AgentFinding[]> {
  readonly name: string;
  review(context: AgentRunContext): Promise<TOutput>;
}

export interface AgentFindingRepository {
  hasOpenFinding(dedupeKey: string): Promise<boolean>;
  saveFinding(finding: PersistedFinding): Promise<void>;
}

export interface LedgerAccountQuery {
  companyId: string;
  fiscalPeriodId: string;
  accountCode: string;
}

export interface LedgerReader {
  /** جمع حساب در Read Model دفتر (projection) برای کل دوره. */
  getProjectionTotals(input: LedgerAccountQuery): Promise<{ debitMinor: bigint; creditMinor: bigint }>;
  /** بازسازی همان جمع از کل اسناد Posted در Journal (منبع حقیقت) برای کل دوره. */
  rebuildJournalTotals(input: LedgerAccountQuery): Promise<{ debitMinor: bigint; creditMinor: bigint }>;
}

export interface IdFactory {
  next(): string;
}

export interface Clock {
  nowIso(): string;
}

/** خطای قطعی Domain؛ این خطا از مرحلهٔ Post عبور نمی‌کند. */
export class DomainValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * کنترل‌های قطعی باید قبل از فراخوانی AI اجرا شوند.
 * این کنترل‌ها هشدار نیستند و در صورت شکست، سند Post نمی‌شود.
 */
export function validatePostingInvariants(snapshot: DocumentSnapshot): void {
  if (snapshot.lines.length < 2) {
    throw new DomainValidationError("MINIMUM_LINES", "سند باید دست‌کم دو سطر داشته باشد.");
  }

  if (snapshot.totalDebitMinor !== snapshot.totalCreditMinor) {
    throw new DomainValidationError("UNBALANCED_ENTRY", "جمع بدهکار و بستانکار برابر نیست.");
  }

  if (snapshot.lines.some((line) => line.accountType === "GROUP")) {
    throw new DomainValidationError("GROUP_ACCOUNT_POSTING", "حساب گروهی محل ثبت مستقیم نیست.");
  }

  if (snapshot.status === "LOCKED" || snapshot.status === "REVERSED") {
    throw new DomainValidationError("INVALID_DOCUMENT_STATUS", "وضعیت سند اجازهٔ بررسی برای ثبت جدید را نمی‌دهد.");
  }
}

function warning(
  context: AgentRunContext,
  input: Omit<AgentFinding, "dedupeKey" | "blocking"> & { blocking?: boolean },
): AgentFinding {
  return {
    ...input,
    blocking: input.blocking ?? false,
    dedupeKey: [
      context.snapshot.documentId,
      context.snapshot.documentVersion,
      input.code,
      context.rulesetVersion,
    ].join(":"),
  };
}

export class AccountingReviewAgent implements Agent {
  readonly name = "accounting-review";

  async review(context: AgentRunContext): Promise<AgentFinding[]> {
    const { snapshot } = context;
    const findings: AgentFinding[] = [];

    const foreignLines = snapshot.lines.filter((line) => line.currencyCode !== snapshot.baseCurrencyCode);
    if (foreignLines.length > 0 && snapshot.currencyCode === snapshot.baseCurrencyCode) {
      findings.push(
        warning(context, {
          code: "LINE_CURRENCY_MISMATCH",
          severity: "WARNING",
          confidence: 0.98,
          title: "ارز سطر با ارز سند همسان نیست",
          explanation: "برای سطر ارزی، ارز سند یا valuation context باید صریح ثبت شود.",
          evidence: [{ field: "lines.currencyCode", observedValue: foreignLines[0].currencyCode, source: "DOCUMENT" }],
          suggestedActions: [{ code: "REVIEW_CURRENCY", label: "بررسی ارز و نرخ سند", requiresHumanApproval: true }],
          sourceRefs: [],
          expiresAt: null,
        }),
      );
    }

    if (snapshot.attachmentIds.length === 0 && ["PURCHASE_INVOICE", "EXPENSE"].includes(snapshot.documentType)) {
      findings.push(
        warning(context, {
          code: "MISSING_SUPPORTING_ATTACHMENT",
          severity: "WARNING",
          confidence: 0.99,
          title: "پیوست پشتیبان ثبت نشده است",
          explanation: "برای این نوع سند، پیوست یا توضیح دلیل نبود پیوست پیشنهاد می‌شود.",
          evidence: [{ field: "attachmentIds", observedValue: 0, source: "DOCUMENT" }],
          suggestedActions: [{ code: "ADD_ATTACHMENT", label: "افزودن فاکتور یا رسید", requiresHumanApproval: false }],
          sourceRefs: [],
          expiresAt: null,
        }),
      );
    }

    return findings;
  }
}

export class ComplianceReviewAgent implements Agent {
  readonly name = "compliance-review";

  async review(context: AgentRunContext): Promise<AgentFinding[]> {
    const { snapshot } = context;
    if (snapshot.documentType !== "PURCHASE_INVOICE" && snapshot.documentType !== "EXPENSE") return [];

    // نمونهٔ غیرقطعی: Rule Pack واقعی باید از منبع رسمی و تاریخ اثر خوانده شود.
    return [
      warning(context, {
        code: "TAX_SOURCE_REVIEW_REQUIRED",
        severity: "INFO",
        confidence: null,
        title: "بررسی مقرراتی نیازمند تأیید منبع است",
        explanation: "ایجنت نمی‌تواند از روی متن سند به‌تنهایی شمول مالیاتی یا اعتبار مالیات را قطعی اعلام کند.",
        evidence: [{ field: "documentType", observedValue: snapshot.documentType, source: "DOCUMENT" }],
        suggestedActions: [{ code: "OPEN_RULE_REVIEW", label: "بازکردن Rule Pack و منبع رسمی", requiresHumanApproval: true }],
        sourceRefs: [],
        expiresAt: null,
      }),
    ];
  }
}

export class LedgerIntegrityAgent implements Agent {
  readonly name = "ledger-integrity";

  constructor(private readonly ledger: LedgerReader) {}

  async review(context: AgentRunContext): Promise<AgentFinding[]> {
    const { snapshot } = context;
    const findings: AgentFinding[] = [];

    // مقایسهٔ درست: projection کل حساب/دوره با بازسازی کل Journal همان حساب/دوره.
    // جمع سطرهای همین یک سند معیار نیست؛ سندهای دیگر همان حساب در دوره هم در projection هستند.
    for (const accountCode of new Set(snapshot.lines.map((line) => line.accountCode))) {
      const query = {
        companyId: snapshot.companyId,
        fiscalPeriodId: snapshot.fiscalPeriodId,
        accountCode,
      };
      const [expected, actual] = await Promise.all([
        this.ledger.rebuildJournalTotals(query),
        this.ledger.getProjectionTotals(query),
      ]);

      if (expected.debitMinor !== actual.debitMinor || expected.creditMinor !== actual.creditMinor) {
        findings.push(
          warning(context, {
            code: "LEDGER_PROJECTION_MISMATCH",
            severity: "HIGH_RISK",
            confidence: 1,
            title: "اختلاف بین Journal و Read Model دفتر",
            explanation: "Read Model باید از Journal قابل بازسازی باشد؛ این اختلاف نیازمند بررسی فنی است.",
            evidence: [
              { field: `account:${accountCode}.debit`, observedValue: actual.debitMinor.toString(), expectedValue: expected.debitMinor.toString(), source: "LEDGER" },
              { field: `account:${accountCode}.credit`, observedValue: actual.creditMinor.toString(), expectedValue: expected.creditMinor.toString(), source: "LEDGER" },
            ],
            suggestedActions: [{ code: "REBUILD_PROJECTION", label: "بازسازی Read Model پس از بررسی", requiresHumanApproval: true }],
            sourceRefs: [],
            expiresAt: null,
          }),
        );
      }
    }

    return findings;
  }
}

export class AgentOrchestrator {
  constructor(
    private readonly agents: Agent[],
    private readonly findings: AgentFindingRepository,
    private readonly ids: IdFactory,
    private readonly clock: Clock,
  ) {}

  async review(context: AgentRunContext): Promise<PersistedFinding[]> {
    // این کنترل به UI یا AI واگذار نمی‌شود.
    validatePostingInvariants(context.snapshot);

    const results = await Promise.allSettled(this.agents.map((agent) => agent.review(context)));
    const persisted: PersistedFinding[] = [];

    for (const result of results) {
      if (result.status === "rejected") {
        // شکست Agent نباید سند را تغییر دهد؛ باید در observability ثبت شود.
        console.error("agent_failed", { eventId: context.eventId, reason: result.reason });
        continue;
      }

      for (const finding of result.value) {
        // خروجی مدل یا Agent هرگز اجازه ندارد blocking را خودش فعال کند.
        const safeFinding = { ...finding, blocking: false };
        if (await this.findings.hasOpenFinding(safeFinding.dedupeKey)) continue;

        const record: PersistedFinding = {
          ...safeFinding,
          findingId: this.ids.next(),
          runId: context.runId,
          documentId: context.snapshot.documentId,
          documentVersion: context.snapshot.documentVersion,
          status: "OPEN",
          createdAt: this.clock.nowIso(),
        };
        await this.findings.saveFinding(record);
        persisted.push(record);
      }
    }

    return persisted;
  }
}

/**
 * Posting باید Command جداگانه و تراکنشی باشد:
 * 1) ابتدا validatePostingInvariants؛
 * 2) سپس مجوز، دوره و idempotency؛
 * 3) درج Journal و Lines؛
 * 4) درج Outbox event؛
 * 5) commit.
 * وجود warningهای بالا مانع این Command نیست؛ وجود DomainValidationError مانع است.
 */
