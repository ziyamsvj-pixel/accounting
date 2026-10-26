import type { Account, FiscalPeriod, JournalDocument } from "@/domain/journal";
import type { DocumentRateSnapshot } from "@/domain/fx";

/**
 * Portهای Application. پیاده‌سازی Supabase/Postgres پس از تصویب Migration (F2) ساخته می‌شود؛
 * فعلاً پیاده‌سازی درحافظه برای تست و نمونه موجود است.
 */
export interface Clock {
  nowIso(): string;
}
export interface IdFactory {
  next(prefix?: string): string;
}

export interface OutboxEvent {
  eventId: string;
  type:
    | "journal.created"
    | "journal.submitted"
    | "journal.approved"
    | "journal.posted"
    | "journal.reversed"
    | "journal.returned";
  tenantId: string;
  companyId: string;
  documentId: string;
  documentVersion: number;
  correlationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  attempts: number;
  status: "PENDING" | "DONE" | "DEAD";
  lastError?: string | null;
  availableAt: string;
}

export interface TxContext {
  journals: JournalRepository;
  periods: FiscalPeriodRepository;
  accounts: AccountRepository;
  snapshots: RateSnapshotRepository;
  outbox: OutboxRepository;
  idempotency: IdempotencyStore;
  numbers: DocumentNumberAllocator;
  audit: AuditLog;
}

/** همهٔ تغییرات یک Command در یک تراکنش اتمیک؛ در صورت خطا هیچ تغییری باقی نمی‌ماند. */
export interface UnitOfWork {
  transaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T>;
}

export interface JournalRepository {
  get(documentId: string): Promise<JournalDocument | null>;
  /** درج سند جدید. */
  insert(doc: JournalDocument): Promise<void>;
  /** به‌روزرسانی با قفل خوش‌بینانه: فقط اگر نسخهٔ فعلی = expectedVersion. */
  update(doc: JournalDocument, expectedVersion: number): Promise<void>;
  listPosted(companyId: string, fiscalPeriodId: string): Promise<JournalDocument[]>;
  /**
   * اسناد برگشتیِ یک سند اصلی (هر وضعیتی). در پیاده‌سازی پایگاه‌داده باید با قید یکتای
   * (reversal_of_id) پشتیبانی شود تا دو برگشت هم‌زمان ممکن نباشد.
   */
  findReversalsOf(originalId: string): Promise<JournalDocument[]>;
}

export interface FiscalPeriodRepository {
  get(id: string): Promise<FiscalPeriod | null>;
}
export interface AccountRepository {
  chart(companyId: string): Promise<ReadonlyMap<string, Account>>;
}
export interface RateSnapshotRepository {
  listFor(documentId: string): Promise<DocumentRateSnapshot[]>;
  insert(s: DocumentRateSnapshot): Promise<void>;
}
export interface OutboxRepository {
  enqueue(e: OutboxEvent): Promise<void>;
}
export interface IdempotencyRecord {
  key: string;
  scope: string;
  requestHash: string;
  result: unknown;
}
export interface IdempotencyStore {
  get(scope: string, key: string): Promise<IdempotencyRecord | null>;
  put(rec: IdempotencyRecord): Promise<void>;
}
/** شمارهٔ قطعی یکتا و پیوسته در Company و دوره (در Postgres: sequence/row-lock جدا برای هر دوره). */
export interface DocumentNumberAllocator {
  next(companyId: string, fiscalPeriodId: string): Promise<string>;
}
export interface AuditEntry {
  at: string;
  actorId: string;
  action: string;
  documentId: string;
  fromVersion: number;
  toVersion: number;
  correlationId: string;
  details?: Record<string, unknown>;
}
export interface AuditLog {
  append(e: AuditEntry): Promise<void>;
}
