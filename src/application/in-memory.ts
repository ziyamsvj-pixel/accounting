import { DomainValidationError } from "@/domain/errors";
import type { DocumentRateSnapshot } from "@/domain/fx";
import type { Account, FiscalPeriod, JournalDocument } from "@/domain/journal";
import type {
  AuditEntry,
  Clock,
  IdFactory,
  IdempotencyRecord,
  OutboxEvent,
  TxContext,
  UnitOfWork,
} from "./ports";

/**
 * پیاده‌سازی درحافظه با تراکنش سریالی و rollback کامل.
 * فقط برای تست و نمونه؛ رفتار آن قرارداد پیاده‌سازی Postgres آینده را مشخص می‌کند.
 */
export interface MemoryState {
  journals: Map<string, JournalDocument>;
  periods: Map<string, FiscalPeriod>;
  charts: Map<string, Map<string, Account>>;
  snapshots: Map<string, DocumentRateSnapshot[]>;
  outbox: OutboxEvent[];
  idempotency: Map<string, IdempotencyRecord>;
  sequences: Map<string, number>;
  audit: AuditEntry[];
}

export function emptyState(): MemoryState {
  return {
    journals: new Map(),
    periods: new Map(),
    charts: new Map(),
    snapshots: new Map(),
    outbox: [],
    idempotency: new Map(),
    sequences: new Map(),
    audit: [],
  };
}

const clone = <T>(v: T): T => structuredClone(v);

export class InMemoryUnitOfWork implements UnitOfWork {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    public state: MemoryState = emptyState(),
    private readonly numberFormat = (seq: number, periodId: string) =>
      `${periodId}-${String(seq).padStart(6, "0")}`,
  ) {}

  transaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
    const run = async () => {
      const working = clone(this.state);
      const result = await fn(this.ctx(working));
      this.state = working; // commit
      return result;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private ctx(s: MemoryState): TxContext {
    const fmt = this.numberFormat;
    return {
      journals: {
        async get(id) {
          const d = s.journals.get(id);
          return d ? clone(d) : null;
        },
        async insert(doc) {
          if (s.journals.has(doc.documentId))
            throw new DomainValidationError("CONCURRENCY_CONFLICT", "سند تکراری");
          s.journals.set(doc.documentId, clone(doc));
        },
        async update(doc, expectedVersion) {
          const cur = s.journals.get(doc.documentId);
          if (!cur || cur.version !== expectedVersion) {
            throw new DomainValidationError(
              "CONCURRENCY_CONFLICT",
              "سند توسط کاربر دیگری تغییر کرده است.",
              { currentVersion: cur?.version },
            );
          }
          if (cur.status === "POSTED" && !(doc.status === "REVERSED" && doc.reversedById)) {
            throw new DomainValidationError("POSTED_IMMUTABLE", "سند Posted تغییرناپذیر است.");
          }
          s.journals.set(doc.documentId, clone(doc));
        },
        async findReversalsOf(originalId) {
          return [...s.journals.values()].filter((d) => d.reversalOfId === originalId).map(clone);
        },
        async listPosted(companyId, periodId) {
          return [...s.journals.values()]
            .filter(
              (d) =>
                d.scope.companyId === companyId &&
                d.fiscalPeriodId === periodId &&
                (d.status === "POSTED" || d.status === "REVERSED"),
            )
            .map(clone);
        },
      },
      periods: {
        async get(id) {
          return s.periods.get(id) ?? null;
        },
      },
      accounts: {
        async chart(companyId) {
          return s.charts.get(companyId) ?? new Map();
        },
      },
      snapshots: {
        async listFor(id) {
          return s.snapshots.get(id) ?? [];
        },
        async insert(snap) {
          s.snapshots.set(snap.documentId, [...(s.snapshots.get(snap.documentId) ?? []), snap]);
        },
      },
      outbox: {
        async enqueue(e) {
          s.outbox.push(clone(e));
        },
      },
      idempotency: {
        async get(scope, key) {
          return s.idempotency.get(`${scope}|${key}`) ?? null;
        },
        async put(rec) {
          s.idempotency.set(`${rec.scope}|${rec.key}`, clone(rec));
        },
      },
      numbers: {
        async next(companyId, periodId) {
          const k = `${companyId}|${periodId}`;
          const n = (s.sequences.get(k) ?? 0) + 1;
          s.sequences.set(k, n);
          return fmt(n, periodId);
        },
      },
      audit: {
        async append(e) {
          s.audit.push(clone(e));
        },
      },
    };
  }
}

export class FixedClock implements Clock {
  constructor(private iso = "2026-10-27T08:00:00.000Z") {}
  nowIso() {
    return this.iso;
  }
  set(iso: string) {
    this.iso = iso;
  }
}

export class SequentialIds implements IdFactory {
  private n = 0;
  next(prefix = "id") {
    this.n += 1;
    return `${prefix}-${String(this.n).padStart(4, "0")}`;
  }
}
