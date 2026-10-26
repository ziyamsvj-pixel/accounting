import type { JournalDocument } from "@/domain/journal";

export type Severity = "INFO" | "WARNING" | "HIGH_RISK" | "BLOCKING";
export type FindingStatus =
  "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED" | "ESCALATED";

export interface Evidence {
  field: string;
  observedValue: string | number | null;
  expectedValue?: string | number | null;
  source: "DOCUMENT" | "ATTACHMENT" | "OCR" | "LEDGER" | "RULE" | "HISTORY" | "DOMAIN";
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

/** نتیجهٔ OCR پیوست؛ از سرویس بیرونی می‌آید و قطعی فرض نمی‌شود. */
export interface OcrExtraction {
  attachmentId: string;
  vendorNationalId?: string | null;
  vendorEconomicCode?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  totalMinor?: bigint | null;
  confidence: number;
}

export interface ReviewSubject {
  document: JournalDocument;
  /** شناسهٔ فروشنده/طرف حساب ثبت‌شده توسط کاربر. */
  declaredVendorNationalId?: string | null;
  ocr?: readonly OcrExtraction[];
}

export interface AgentRunContext {
  runId: string;
  eventId: string;
  correlationId: string;
  rulesetVersion: string;
  subject: ReviewSubject;
}

export interface AgentFinding {
  code: string;
  severity: Exclude<Severity, "BLOCKING">;
  confidence: number | null;
  title: string;
  explanation: string;
  evidence: Evidence[];
  suggestedActions: SuggestedAction[];
  sourceRefs: SourceRef[];
  expiresAt: string | null;
}

export interface PersistedFinding extends AgentFinding {
  findingId: string;
  agent: string;
  runId: string;
  correlationId: string;
  rulesetVersion: string;
  documentId: string;
  documentVersion: number;
  companyId: string;
  branchId: string | null;
  /** فقط وقتی true است که منشأ آن قواعد قطعی Domain باشد؛ هرگز از خروجی ایجنت. */
  blocking: boolean;
  dedupeKey: string;
  status: FindingStatus;
  createdAt: string;
}

export interface Agent {
  readonly name: string;
  readonly version: string;
  /** ایجنت فقط می‌خواند و Finding برمی‌گرداند؛ به Journal دسترسی نوشتن ندارد. */
  review(context: AgentRunContext): Promise<AgentFinding[]>;
}

export interface AgentRunRecord {
  runId: string;
  agent: string;
  agentVersion: string;
  eventId: string;
  correlationId: string;
  documentId: string;
  documentVersion: number;
  rulesetVersion: string;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  findingCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string;
}

export interface FindingRepository {
  /** وجود یافته با همین کلید در هر وضعیتی (برای جلوگیری از ساخت دوبارهٔ یافتهٔ ردشده). */
  findByDedupeKey(companyId: string, dedupeKey: string): Promise<PersistedFinding | null>;
  /**
   * ذخیرهٔ اتمیک: فقط اگر یافته‌ای با همان (companyId, dedupeKey) در هیچ وضعیتی نباشد.
   * در پایگاه‌داده با قید یکتای (company_id, dedupe_key) و ON CONFLICT DO NOTHING پیاده می‌شود.
   * @returns true اگر درج شد.
   */
  saveIfAbsent(f: PersistedFinding): Promise<boolean>;
  saveRun(r: AgentRunRecord): Promise<void>;
  listOpen(companyId: string): Promise<PersistedFinding[]>;
}
