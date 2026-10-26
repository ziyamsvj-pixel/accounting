import { DomainValidationError } from "./errors";
import type { DocumentStatus, JournalDocument, JournalLine } from "./journal";

export type Role = "viewer" | "editor" | "approver" | "poster" | "admin";
export type WorkflowAction = "EDIT" | "SUBMIT" | "RETURN_TO_DRAFT" | "APPROVE" | "POST" | "REVERSE";

export interface Actor {
  userId: string;
  roles: readonly Role[];
  tenantId: string;
  companyIds: readonly string[];
  branchIds?: readonly string[] | null; // null = همهٔ شعب شرکت
}

/**
 * Policy نقش‌ها؛ نقش‌های Approve و Post تصمیم مدیریت است (اسلاید ۱۵، بند ۵).
 * پیش‌فرض محافظه‌کارانه: فقط admin تأیید و ثبت قطعی می‌کند؛ تفکیک وظایف فعال است.
 */
export interface WorkflowPolicy {
  editRoles: readonly Role[];
  submitRoles: readonly Role[];
  approveRoles: readonly Role[];
  postRoles: readonly Role[];
  reverseRoles: readonly Role[];
  /** تأییدکننده نباید ایجادکنندهٔ سند باشد. */
  segregationOfDuties: boolean;
}

export const DEFAULT_WORKFLOW_POLICY: WorkflowPolicy = Object.freeze({
  editRoles: ["editor", "admin"] as Role[],
  submitRoles: ["editor", "admin"] as Role[],
  approveRoles: ["approver", "admin"] as Role[],
  postRoles: ["poster", "admin"] as Role[],
  reverseRoles: ["poster", "admin"] as Role[],
  segregationOfDuties: true,
});

const TRANSITIONS: Record<
  Exclude<WorkflowAction, "EDIT">,
  { from: readonly DocumentStatus[]; to: DocumentStatus }
> = {
  SUBMIT: { from: ["DRAFT"], to: "SUBMITTED" },
  RETURN_TO_DRAFT: { from: ["SUBMITTED", "APPROVED"], to: "DRAFT" },
  APPROVE: { from: ["SUBMITTED"], to: "APPROVED" },
  POST: { from: ["APPROVED"], to: "POSTED" },
  REVERSE: { from: ["POSTED"], to: "REVERSED" },
};

export function assertScope(actor: Actor, doc: Pick<JournalDocument, "scope">): void {
  const s = doc.scope;
  const branchOk =
    actor.branchIds == null || s.branchId === null || actor.branchIds.includes(s.branchId);
  if (actor.tenantId !== s.tenantId || !actor.companyIds.includes(s.companyId) || !branchOk) {
    throw new DomainValidationError(
      "TENANT_SCOPE_VIOLATION",
      "کاربر به این Tenant/Company/Branch دسترسی ندارد.",
    );
  }
}

function rolesFor(action: WorkflowAction, p: WorkflowPolicy): readonly Role[] {
  switch (action) {
    case "EDIT":
      return p.editRoles;
    case "SUBMIT":
    case "RETURN_TO_DRAFT":
      return p.submitRoles;
    case "APPROVE":
      return p.approveRoles;
    case "POST":
      return p.postRoles;
    case "REVERSE":
      return p.reverseRoles;
  }
}

export function assertPermission(
  actor: Actor,
  action: WorkflowAction,
  doc: JournalDocument,
  policy: WorkflowPolicy = DEFAULT_WORKFLOW_POLICY,
): void {
  assertScope(actor, doc);
  const allowed = rolesFor(action, policy);
  if (!actor.roles.some((r) => allowed.includes(r))) {
    throw new DomainValidationError(
      "PERMISSION_DENIED",
      `نقش کاربر اجازهٔ «${action}» را نمی‌دهد.`,
    );
  }
  if (policy.segregationOfDuties && action === "APPROVE" && doc.createdBy === actor.userId) {
    throw new DomainValidationError(
      "SEGREGATION_OF_DUTIES",
      "ایجادکنندهٔ سند نمی‌تواند همان سند را تأیید کند.",
    );
  }
}

export function assertVersion(
  doc: Pick<JournalDocument, "version">,
  expectedVersion: number,
): void {
  if (doc.version !== expectedVersion) {
    throw new DomainValidationError(
      "CONCURRENCY_CONFLICT",
      `سند توسط کاربر دیگری تغییر کرده است (نسخهٔ فعلی ${doc.version}، نسخهٔ شما ${expectedVersion}).`,
      {
        currentVersion: doc.version,
        expectedVersion,
      },
    );
  }
}

/** انتقال وضعیت خالص؛ نسخه یک واحد افزایش می‌یابد. */
export function transition(
  doc: JournalDocument,
  action: Exclude<WorkflowAction, "EDIT">,
  actor: Actor,
  at: string,
  policy: WorkflowPolicy = DEFAULT_WORKFLOW_POLICY,
): JournalDocument {
  const t = TRANSITIONS[action];
  if (!t.from.includes(doc.status)) {
    throw new DomainValidationError(
      "INVALID_TRANSITION",
      `انتقال «${action}» از وضعیت ${doc.status} مجاز نیست.`,
    );
  }
  assertPermission(actor, action, doc, policy);
  const next: JournalDocument = { ...doc, status: t.to, version: doc.version + 1 };
  if (action === "SUBMIT") next.submittedBy = actor.userId;
  if (action === "APPROVE") next.approvedBy = actor.userId;
  if (action === "RETURN_TO_DRAFT") next.approvedBy = null;
  if (action === "POST") {
    next.postedBy = actor.userId;
    next.postedAt = at;
  }
  return next;
}

/** ویرایش فقط در Draft؛ سند Posted مستقیماً قابل ویرایش نیست (اصل ۳). */
export function editDraft(
  doc: JournalDocument,
  patch: {
    lines?: readonly JournalLine[];
    description?: string | null;
    entryDate?: string;
    attachmentIds?: readonly string[];
    sourceReference?: string | null;
  },
  actor: Actor,
  expectedVersion: number,
  policy: WorkflowPolicy = DEFAULT_WORKFLOW_POLICY,
): JournalDocument {
  if (doc.status === "POSTED" || doc.status === "REVERSED") {
    throw new DomainValidationError(
      "POSTED_IMMUTABLE",
      "سند ثبت‌قطعی‌شده قابل ویرایش مستقیم نیست؛ از سند برگشتی استفاده کنید.",
    );
  }
  if (doc.status !== "DRAFT") {
    throw new DomainValidationError(
      "INVALID_TRANSITION",
      "برای ویرایش، ابتدا سند را به پیش‌نویس برگردانید.",
    );
  }
  assertPermission(actor, "EDIT", doc, policy);
  assertVersion(doc, expectedVersion);
  if (doc.documentType === "REVERSAL" && patch.lines !== undefined) {
    throw new DomainValidationError(
      "REVERSAL_MISMATCH",
      "سطرهای سند برگشتی از سند اصلی ساخته می‌شوند و قابل ویرایش نیستند.",
    );
  }
  if (actor.userId !== doc.createdBy && !actor.roles.includes("admin")) {
    throw new DomainValidationError(
      "PERMISSION_DENIED",
      "فقط ایجادکنندهٔ پیش‌نویس یا مدیر می‌تواند آن را ویرایش کند.",
    );
  }
  return {
    ...doc,
    ...(patch.lines !== undefined ? { lines: patch.lines } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.entryDate !== undefined ? { entryDate: patch.entryDate } : {}),
    ...(patch.attachmentIds !== undefined ? { attachmentIds: patch.attachmentIds } : {}),
    ...(patch.sourceReference !== undefined ? { sourceReference: patch.sourceReference } : {}),
    version: doc.version + 1,
  };
}

/**
 * سند برگشتی: سطرها با جابه‌جایی بدهکار/بستانکار؛ snapshot نرخ همان سند اصلی حفظ می‌شود.
 * سند جدید به‌صورت Draft و با چرخهٔ عادی تأیید ساخته می‌شود.
 */
export function buildReversal(
  original: JournalDocument,
  input: {
    documentId: string;
    idempotencyKey: string;
    entryDate: string;
    fiscalPeriodId: string;
    actor: Actor;
    at: string;
    reason: string;
  },
): JournalDocument {
  if (original.status !== "POSTED") {
    throw new DomainValidationError("INVALID_TRANSITION", "فقط سند Posted قابل برگشت است.");
  }
  if (original.reversedById) {
    throw new DomainValidationError("ALREADY_REVERSED", "این سند قبلاً برگشت خورده است.");
  }
  assertPermission(input.actor, "REVERSE", original);
  return {
    scope: original.scope,
    documentId: input.documentId,
    documentType: "REVERSAL",
    draftNumber: `REV-${original.documentNumber ?? original.draftNumber}`,
    documentNumber: null,
    version: 1,
    status: "DRAFT",
    fiscalPeriodId: input.fiscalPeriodId,
    entryDate: input.entryDate,
    description: `برگشت سند ${original.documentNumber ?? original.documentId}: ${input.reason}`,
    baseCurrency: original.baseCurrency,
    lines: original.lines.map((l) => ({
      ...l,
      debitBaseMinor: l.creditBaseMinor,
      creditBaseMinor: l.debitBaseMinor,
      foreignAmountMinor: l.foreignAmountMinor ?? null,
    })),
    attachmentIds: [],
    sourceReference: original.documentId,
    idempotencyKey: input.idempotencyKey,
    createdBy: input.actor.userId,
    createdAt: input.at,
    reversalOfId: original.documentId,
  };
}

/**
 * سند برگشتی باید دقیقاً قرینهٔ سند اصلی باشد: همان حساب، طبقه‌بندی، ارز، مبلغ ارزی و snapshot،
 * با جابه‌جایی بدهکار و بستانکار. هنگام Post برگشتی دوباره بررسی می‌شود.
 */
export function assertReversalMirrors(original: JournalDocument, reversal: JournalDocument): void {
  const fail = (i: number | null, why: string) => {
    throw new DomainValidationError(
      "REVERSAL_MISMATCH",
      i === null ? `سند برگشتی با سند اصلی نمی‌خواند: ${why}` : `سطر ${i + 1} سند برگشتی: ${why}`,
      i === null ? {} : { lineIndex: i },
    );
  };
  if (reversal.reversalOfId !== original.documentId) fail(null, "پیوند سند اصلی نادرست است.");
  if (reversal.scope.companyId !== original.scope.companyId) fail(null, "شرکت متفاوت است.");
  if (reversal.baseCurrency !== original.baseCurrency) fail(null, "ارز پایه متفاوت است.");
  if (reversal.lines.length !== original.lines.length) fail(null, "تعداد سطرها متفاوت است.");
  reversal.lines.forEach((r, i) => {
    const o = original.lines[i]!;
    const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
    if (
      r.accountCode !== o.accountCode ||
      !same(r.subsidiaryCode, o.subsidiaryCode) ||
      !same(r.detail1Code, o.detail1Code) ||
      !same(r.detail2Code, o.detail2Code) ||
      r.currencyCode !== o.currencyCode ||
      !same(r.foreignAmountMinor, o.foreignAmountMinor) ||
      !same(r.rateSnapshotId, o.rateSnapshotId) ||
      !same(r.partyId, o.partyId) ||
      !same(r.costCenterId, o.costCenterId)
    )
      fail(i, "حساب، طبقه‌بندی، ارز یا snapshot با سطر اصلی یکسان نیست.");
    if (r.debitBaseMinor !== o.creditBaseMinor || r.creditBaseMinor !== o.debitBaseMinor)
      fail(i, "مبالغ قرینهٔ سطر اصلی نیست.");
  });
}
