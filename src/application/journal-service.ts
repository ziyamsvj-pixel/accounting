import { CurrencyRegistry } from "@/domain/currency";
import { DomainValidationError } from "@/domain/errors";
import { hashOf } from "@/domain/hash";
import type { JournalDocument, JournalLine, OrgScope } from "@/domain/journal";
import { assertPostable, checkLineInvariants, computeContentHash } from "@/domain/journal";
import type { Actor, WorkflowPolicy } from "@/domain/workflow";
import {
  DEFAULT_WORKFLOW_POLICY,
  assertPermission,
  assertScope,
  assertVersion,
  buildReversal,
  editDraft,
  transition,
} from "@/domain/workflow";
import type { Clock, IdFactory, OutboxEvent, TxContext, UnitOfWork } from "./ports";

export interface CommandMeta {
  actor: Actor;
  idempotencyKey: string;
  correlationId?: string;
}

export interface CreateDraftInput {
  scope: OrgScope;
  documentType: JournalDocument["documentType"];
  fiscalPeriodId: string;
  entryDate: string;
  description: string | null;
  baseCurrency: string;
  lines: JournalLine[];
  attachmentIds?: string[];
  sourceReference?: string | null;
}

export interface CommandResult {
  documentId: string;
  version: number;
  status: JournalDocument["status"];
  documentNumber: string | null;
  /** هشدارهای غیرمسدودکننده در Draft (مثلاً عدم توازن موقت)؛ ذخیره متوقف نمی‌شود. */
  draftWarnings: { code: string; message: string }[];
  replayed: boolean;
}

/**
 * Use Caseهای چرخهٔ سند: Draft → Submit → Approve → Post، و Reversal.
 * - Idempotency Key از ثبت تکراری (دوبار کلیک، دو باجه) جلوگیری می‌کند.
 * - Optimistic Locking از بازنویسی هم‌زمان جلوگیری می‌کند.
 * - Posting تراکنشی است: invariant → مجوز/دوره → شماره → ذخیره → Outbox → commit.
 * - هشدار ایجنت‌ها هرگز مانع این Commandها نیست؛ فقط DomainValidationError مانع است.
 */
export class JournalService {
  private readonly currencies: CurrencyRegistry;
  constructor(
    private readonly uow: UnitOfWork,
    private readonly ids: IdFactory,
    private readonly clock: Clock,
    private readonly policy: WorkflowPolicy = DEFAULT_WORKFLOW_POLICY,
    currencies: CurrencyRegistry = new CurrencyRegistry(),
  ) {
    this.currencies = currencies;
  }

  createDraft(input: CreateDraftInput, meta: CommandMeta): Promise<CommandResult> {
    return this.idempotent("createDraft", input, meta, async (tx, correlationId) => {
      const now = this.clock.nowIso();
      const documentId = this.ids.next("doc");
      const doc: JournalDocument = {
        scope: input.scope,
        documentId,
        documentType: input.documentType,
        draftNumber: `DRAFT-${documentId}`,
        documentNumber: null,
        version: 1,
        status: "DRAFT",
        fiscalPeriodId: input.fiscalPeriodId,
        entryDate: input.entryDate,
        description: input.description,
        baseCurrency: input.baseCurrency,
        lines: input.lines,
        attachmentIds: input.attachmentIds ?? [],
        sourceReference: input.sourceReference ?? null,
        idempotencyKey: meta.idempotencyKey,
        createdBy: meta.actor.userId,
        createdAt: now,
      };
      assertPermission(meta.actor, "EDIT", doc, this.policy);
      await tx.journals.insert(doc);
      await this.emit(tx, doc, "journal.created", correlationId, {});
      await tx.audit.append({
        at: now,
        actorId: meta.actor.userId,
        action: "CREATE_DRAFT",
        documentId,
        fromVersion: 0,
        toVersion: 1,
        correlationId,
      });
      return this.result(doc, await this.draftWarnings(tx, doc), false);
    });
  }

  updateDraft(
    documentId: string,
    expectedVersion: number,
    patch: Parameters<typeof editDraft>[1],
    meta: CommandMeta,
  ): Promise<CommandResult> {
    return this.idempotent(
      "updateDraft",
      { documentId, expectedVersion, patch },
      meta,
      async (tx, correlationId) => {
        const doc = await this.load(tx, documentId, meta.actor);
        const next = editDraft(doc, patch, meta.actor, expectedVersion, this.policy);
        await tx.journals.update(next, expectedVersion);
        await tx.audit.append({
          at: this.clock.nowIso(),
          actorId: meta.actor.userId,
          action: "EDIT_DRAFT",
          documentId,
          fromVersion: doc.version,
          toVersion: next.version,
          correlationId,
        });
        return this.result(next, await this.draftWarnings(tx, next), false);
      },
    );
  }

  submit(documentId: string, expectedVersion: number, meta: CommandMeta): Promise<CommandResult> {
    return this.simpleTransition("SUBMIT", "journal.submitted", documentId, expectedVersion, meta);
  }

  approve(documentId: string, expectedVersion: number, meta: CommandMeta): Promise<CommandResult> {
    return this.simpleTransition("APPROVE", "journal.approved", documentId, expectedVersion, meta);
  }

  returnToDraft(
    documentId: string,
    expectedVersion: number,
    meta: CommandMeta,
  ): Promise<CommandResult> {
    return this.simpleTransition(
      "RETURN_TO_DRAFT",
      "journal.returned",
      documentId,
      expectedVersion,
      meta,
    );
  }

  post(documentId: string, expectedVersion: number, meta: CommandMeta): Promise<CommandResult> {
    return this.idempotent(
      "post",
      { documentId, expectedVersion },
      meta,
      async (tx, correlationId) => {
        const doc = await this.load(tx, documentId, meta.actor);
        assertVersion(doc, expectedVersion);
        // ۱) قواعد قطعی Domain
        const [period, accounts, snaps] = await Promise.all([
          tx.periods.get(doc.fiscalPeriodId),
          tx.accounts.chart(doc.scope.companyId),
          this.snapshotIdsFor(tx, doc),
        ]);
        assertPostable(doc, {
          period,
          accounts,
          currencies: this.currencies,
          rateSnapshotIds: snaps,
        });
        // ۲) مجوز و انتقال وضعیت
        const at = this.clock.nowIso();
        const moved = transition(doc, "POST", meta.actor, at, this.policy);
        // ۳) شمارهٔ قطعی یکتا در Company و دوره
        const documentNumber = await tx.numbers.next(doc.scope.companyId, doc.fiscalPeriodId);
        const posted: JournalDocument = { ...moved, documentNumber };
        posted.contentHash = computeContentHash(posted);
        // ۴) ذخیره با قفل خوش‌بینانه + Outbox در همان تراکنش
        await tx.journals.update(posted, expectedVersion);
        await this.emit(tx, posted, "journal.posted", correlationId, {
          documentNumber,
          contentHash: posted.contentHash,
        });
        await tx.audit.append({
          at,
          actorId: meta.actor.userId,
          action: "POST",
          documentId,
          fromVersion: doc.version,
          toVersion: posted.version,
          correlationId,
          details: { documentNumber },
        });
        return this.result(posted, [], false);
      },
    );
  }

  /** برگشت سند Posted: سند جدید Draft با سطرهای معکوس؛ سند اصلی فقط پس از Post برگشتی REVERSED می‌شود. */
  createReversal(
    originalId: string,
    input: { entryDate: string; fiscalPeriodId: string; reason: string },
    meta: CommandMeta,
  ): Promise<CommandResult> {
    return this.idempotent(
      "createReversal",
      { originalId, input },
      meta,
      async (tx, correlationId) => {
        const original = await this.load(tx, originalId, meta.actor);
        const rev = buildReversal(original, {
          documentId: this.ids.next("doc"),
          idempotencyKey: meta.idempotencyKey,
          entryDate: input.entryDate,
          fiscalPeriodId: input.fiscalPeriodId,
          actor: meta.actor,
          at: this.clock.nowIso(),
          reason: input.reason,
        });
        await tx.journals.insert(rev);
        await this.emit(tx, rev, "journal.created", correlationId, { reversalOf: originalId });
        return this.result(rev, [], false);
      },
    );
  }

  /** پس از Post سند برگشتی، سند اصلی را REVERSED علامت می‌زند (تنها تغییر مجاز روی Posted: پیوند برگشت). */
  completeReversal(reversalId: string, meta: CommandMeta): Promise<CommandResult> {
    return this.idempotent("completeReversal", { reversalId }, meta, async (tx, correlationId) => {
      const rev = await this.load(tx, reversalId, meta.actor);
      if (rev.status !== "POSTED" || !rev.reversalOfId) {
        throw new DomainValidationError("INVALID_TRANSITION", "سند برگشتی هنوز ثبت قطعی نشده است.");
      }
      const original = await this.load(tx, rev.reversalOfId, meta.actor);
      if (original.reversedById)
        throw new DomainValidationError("ALREADY_REVERSED", "این سند قبلاً برگشت خورده است.");
      const marked = {
        ...transition(original, "REVERSE", meta.actor, this.clock.nowIso(), this.policy),
        reversedById: rev.documentId,
      };
      await tx.journals.update(marked, original.version);
      await this.emit(tx, marked, "journal.reversed", correlationId, { reversalId });
      return this.result(marked, [], false);
    });
  }

  // ---------------------------------------------------------------------------

  private simpleTransition(
    action: "SUBMIT" | "APPROVE" | "RETURN_TO_DRAFT",
    type: OutboxEvent["type"],
    documentId: string,
    expectedVersion: number,
    meta: CommandMeta,
  ): Promise<CommandResult> {
    return this.idempotent(
      action,
      { documentId, expectedVersion },
      meta,
      async (tx, correlationId) => {
        const doc = await this.load(tx, documentId, meta.actor);
        assertVersion(doc, expectedVersion);
        if (action === "SUBMIT") {
          // ارسال برای تأیید فقط با سند متوازن و حساب‌های معتبر؛ هشدارهای دیگر مانع نیستند.
          const accounts = await tx.accounts.chart(doc.scope.companyId);
          const v = checkLineInvariants(doc, {
            accounts,
            currencies: this.currencies,
            rateSnapshotIds: await this.snapshotIdsFor(tx, doc),
          });
          if (v.length)
            throw new DomainValidationError(v[0]!.code, v.map((x) => x.message).join(" | "), {
              violations: v,
            });
        }
        const next = transition(doc, action, meta.actor, this.clock.nowIso(), this.policy);
        await tx.journals.update(next, expectedVersion);
        await this.emit(tx, next, type, correlationId, {});
        await tx.audit.append({
          at: this.clock.nowIso(),
          actorId: meta.actor.userId,
          action,
          documentId,
          fromVersion: doc.version,
          toVersion: next.version,
          correlationId,
        });
        return this.result(next, [], false);
      },
    );
  }

  private async load(tx: TxContext, id: string, actor: Actor): Promise<JournalDocument> {
    const doc = await tx.journals.get(id);
    if (!doc) throw new DomainValidationError("INVALID_TRANSITION", `سند ${id} یافت نشد.`);
    assertScope(actor, doc);
    return doc;
  }

  private async snapshotIdsFor(tx: TxContext, doc: JournalDocument): Promise<Set<string>> {
    const ids = new Set((await tx.snapshots.listFor(doc.documentId)).map((s) => s.id));
    if (doc.reversalOfId)
      for (const s of await tx.snapshots.listFor(doc.reversalOfId)) ids.add(s.id);
    return ids;
  }

  private async draftWarnings(tx: TxContext, doc: JournalDocument) {
    const accounts = await tx.accounts.chart(doc.scope.companyId);
    return checkLineInvariants(doc, {
      accounts,
      currencies: this.currencies,
      rateSnapshotIds: await this.snapshotIdsFor(tx, doc),
    }).map(({ code, message }) => ({ code, message }));
  }

  private async emit(
    tx: TxContext,
    doc: JournalDocument,
    type: OutboxEvent["type"],
    correlationId: string,
    payload: Record<string, unknown>,
  ) {
    const now = this.clock.nowIso();
    await tx.outbox.enqueue({
      eventId: this.ids.next("evt"),
      type,
      tenantId: doc.scope.tenantId,
      companyId: doc.scope.companyId,
      documentId: doc.documentId,
      documentVersion: doc.version,
      correlationId,
      occurredAt: now,
      payload,
      attempts: 0,
      status: "PENDING",
      availableAt: now,
    });
  }

  private result(
    doc: JournalDocument,
    draftWarnings: CommandResult["draftWarnings"],
    replayed: boolean,
  ): CommandResult {
    return {
      documentId: doc.documentId,
      version: doc.version,
      status: doc.status,
      documentNumber: doc.documentNumber,
      draftWarnings,
      replayed,
    };
  }

  /** اجرای Command با کلید idempotency؛ تکرار همان درخواست نتیجهٔ قبلی را برمی‌گرداند. */
  private idempotent(
    scopeName: string,
    request: unknown,
    meta: CommandMeta,
    fn: (tx: TxContext, correlationId: string) => Promise<CommandResult>,
  ): Promise<CommandResult> {
    if (!meta.idempotencyKey || meta.idempotencyKey.length < 8) {
      return Promise.reject(
        new DomainValidationError(
          "IDEMPOTENCY_KEY_REUSED",
          "کلید idempotency معتبر (دست‌کم ۸ نویسه) لازم است.",
        ),
      );
    }
    const scope = `${meta.actor.tenantId}:${scopeName}`;
    const requestHash = hashOf(request);
    return this.uow.transaction(async (tx) => {
      const prev = await tx.idempotency.get(scope, meta.idempotencyKey);
      if (prev) {
        if (prev.requestHash !== requestHash) {
          throw new DomainValidationError(
            "IDEMPOTENCY_KEY_REUSED",
            "این کلید idempotency قبلاً برای درخواست دیگری استفاده شده است.",
          );
        }
        return { ...(prev.result as CommandResult), replayed: true };
      }
      const correlationId = meta.correlationId ?? this.ids.next("corr");
      const res = await fn(tx, correlationId);
      await tx.idempotency.put({ key: meta.idempotencyKey, scope, requestHash, result: res });
      return res;
    });
  }
}
