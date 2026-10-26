import { describe, expect, test } from "bun:test";
import {
  AccountingReviewAgent,
  AgentOrchestrator,
  InMemoryFindingRepository,
  buildDailyManagerReport,
} from "@/agents";
import type { PersistedFinding } from "@/agents";
import { JournalService } from "@/application/journal-service";
import { FixedClock, InMemoryUnitOfWork, SequentialIds } from "@/application/in-memory";
import {
  CurrencyRegistry,
  DomainValidationError,
  allocateCost,
  checkLineInvariants,
  computeRevaluation,
  defaultIranPolicy,
  inputToRialMinor,
  rialToTomanDisplay,
  takeRateSnapshot,
  validateRate,
} from "@/domain";
import type { JournalDocument, OpenMonetaryItem } from "@/domain";
import { planPostedLineEnrichment } from "@/lib/legacy-journal-guard";
import {
  accounts,
  clerk,
  clerk2,
  doc,
  manager,
  openPeriod,
  rialLines,
  scope,
  usdIrr,
} from "./fixtures";

const reg = new CurrencyRegistry();
const manager2 = { ...manager, userId: "u-mgr2" };

function setup() {
  const uow = new InMemoryUnitOfWork();
  uow.state.periods.set(openPeriod.id, openPeriod);
  uow.state.charts.set("c1", accounts);
  const svc = new JournalService(uow, new SequentialIds(), new FixedClock());
  return { uow, svc };
}

const draftInput = (amount = 1_500_000n) => ({
  scope,
  documentType: "EXPENSE" as const,
  fiscalPeriodId: openPeriod.id,
  entryDate: "2026-10-27",
  description: "خرید",
  baseCurrency: "IRR",
  lines: rialLines(amount),
  attachmentIds: ["att-1"],
});

async function postedDocument(svc: JournalService, tag: string) {
  const c = await svc.createDraft(draftInput(), {
    actor: clerk,
    idempotencyKey: `key-${tag}-c-0001`,
  });
  const s = await svc.submit(c.documentId, c.version, {
    actor: clerk,
    idempotencyKey: `key-${tag}-s-0001`,
  });
  const a = await svc.approve(s.documentId, s.version, {
    actor: manager,
    idempotencyKey: `key-${tag}-a-0001`,
  });
  return svc.post(a.documentId, a.version, { actor: manager, idempotencyKey: `key-${tag}-p-0001` });
}

const reversalInput = { entryDate: "2026-10-28", fiscalPeriodId: openPeriod.id, reason: "اشتباه" };

describe("برگشت سند: فقط یک‌بار و قرینهٔ دقیق", () => {
  test("برگشت دوم هنگامی که برگشت اول در جریان است رد می‌شود", async () => {
    const { svc, uow } = setup();
    const p = await postedDocument(svc, "rv1");
    await svc.createReversal(p.documentId, reversalInput, {
      actor: manager,
      idempotencyKey: "k-rv1-r1",
    });
    await expect(
      svc.createReversal(p.documentId, reversalInput, {
        actor: manager,
        idempotencyKey: "k-rv1-r2",
      }),
    ).rejects.toMatchObject({ code: "REVERSAL_IN_PROGRESS" });
    const reversals = [...uow.state.journals.values()].filter(
      (d) => d.reversalOfId === p.documentId,
    );
    expect(reversals).toHaveLength(1);
  });

  test("Post سند برگشتی سند اصلی را در همان تراکنش REVERSED می‌کند و Audit ثبت می‌شود", async () => {
    const { svc, uow } = setup();
    const p = await postedDocument(svc, "rv2");
    const r = await svc.createReversal(p.documentId, reversalInput, {
      actor: manager,
      idempotencyKey: "k-rv2-r1",
    });
    const rs = await svc.submit(r.documentId, r.version, {
      actor: manager,
      idempotencyKey: "k-rv2-r2",
    });
    const ra = await svc.approve(rs.documentId, rs.version, {
      actor: manager2,
      idempotencyKey: "k-rv2-r3",
    });
    const rp = await svc.post(ra.documentId, ra.version, {
      actor: manager2,
      idempotencyKey: "k-rv2-r4",
    });
    expect(rp.status).toBe("POSTED");
    const original = uow.state.journals.get(p.documentId)!;
    expect(original.status).toBe("REVERSED");
    expect(original.reversedById).toBe(rp.documentId);
    const actions = uow.state.audit.map((a) => a.action);
    expect(actions).toContain("CREATE_REVERSAL");
    expect(actions).toContain("REVERSE");
    const rev = uow.state.audit.find((a) => a.action === "REVERSE")!;
    expect(rev.actorId).toBe(manager2.userId);
    expect(rev.documentId).toBe(p.documentId);
    // سازگاری: completeReversal اکنون فقط وضعیت را تأیید می‌کند.
    const done = await svc.completeReversal(rp.documentId, {
      actor: manager,
      idempotencyKey: "k-rv2-r5",
    });
    expect(done.status).toBe("REVERSED");
    expect(uow.state.journals.get(p.documentId)!.version).toBe(original.version);
  });

  test("سطرهای سند برگشتی قابل ویرایش نیست", async () => {
    const { svc } = setup();
    const p = await postedDocument(svc, "rv3");
    const r = await svc.createReversal(p.documentId, reversalInput, {
      actor: manager,
      idempotencyKey: "k-rv3-r1",
    });
    await expect(
      svc.updateDraft(
        r.documentId,
        r.version,
        { lines: rialLines(1n) },
        { actor: manager, idempotencyKey: "k-rv3-u1" },
      ),
    ).rejects.toMatchObject({ code: "REVERSAL_MISMATCH" });
    // تغییر توضیح مجاز است.
    const u = await svc.updateDraft(
      r.documentId,
      r.version,
      { description: "برگشت به‌دلیل اشتباه در مبلغ" },
      { actor: manager, idempotencyKey: "k-rv3-u2" },
    );
    expect(u.version).toBe(r.version + 1);
  });

  test("سند برگشتیِ دست‌کاری‌شده Post نمی‌شود و تراکنش برمی‌گردد", async () => {
    const { svc, uow } = setup();
    const p = await postedDocument(svc, "rv4");
    const r = await svc.createReversal(p.documentId, reversalInput, {
      actor: manager,
      idempotencyKey: "k-rv4-r1",
    });
    const rs = await svc.submit(r.documentId, r.version, {
      actor: manager,
      idempotencyKey: "k-rv4-r2",
    });
    const ra = await svc.approve(rs.documentId, rs.version, {
      actor: manager2,
      idempotencyKey: "k-rv4-r3",
    });
    // شبیه‌سازی دست‌کاری مستقیم داده: مبلغ متوازن اما متفاوت با سند اصلی
    const stored = uow.state.journals.get(ra.documentId)!;
    uow.state.journals.set(ra.documentId, { ...stored, lines: rialLines(999n) });
    await expect(
      svc.post(ra.documentId, ra.version, { actor: manager2, idempotencyKey: "k-rv4-r4" }),
    ).rejects.toMatchObject({ code: "REVERSAL_MISMATCH" });
    expect(uow.state.journals.get(p.documentId)!.status).toBe("POSTED");
    expect(uow.state.journals.get(ra.documentId)!.status).toBe("APPROVED");
    expect(uow.state.sequences.get("c1|1405-08")).toBe(1);
  });
});

describe("Idempotency در محدودهٔ کاربر", () => {
  test("کلید یکسان دو کاربر دو سند جدا می‌سازد", async () => {
    const { svc, uow } = setup();
    const a = await svc.createDraft(draftInput(), { actor: clerk, idempotencyKey: "k-shared-01" });
    const b = await svc.createDraft(draftInput(), { actor: clerk2, idempotencyKey: "k-shared-01" });
    expect(a.documentId).not.toBe(b.documentId);
    expect(b.replayed).toBe(false);
    expect(uow.state.journals.size).toBe(2);
  });
});

describe("قواعد ارز و نرخ", () => {
  test("سطر ریالی روی حساب ارزی CURRENCY_MISMATCH می‌گیرد", () => {
    const d = doc({
      lines: [
        { accountCode: "1102", currencyCode: "IRR", debitBaseMinor: 100n, creditBaseMinor: 0n },
        { accountCode: "1101", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 100n },
      ],
    });
    const v = checkLineInvariants(d, { accounts, currencies: reg, rateSnapshotIds: new Set() });
    expect(v.map((x) => x.code)).toEqual(["CURRENCY_MISMATCH"]);
    expect(v[0]!.lineIndex).toBe(0);
  });

  test("سطر ارزی روی حساب ریالی (currencyCode=null) CURRENCY_MISMATCH می‌گیرد", () => {
    const d = doc({
      lines: [
        {
          accountCode: "6101",
          currencyCode: "USD",
          foreignAmountMinor: 100n,
          rateSnapshotId: "snap-1",
          debitBaseMinor: 500n,
          creditBaseMinor: 0n,
        },
        { accountCode: "1101", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 500n },
      ],
    });
    const v = checkLineInvariants(d, {
      accounts,
      currencies: reg,
      rateSnapshotIds: new Set(["snap-1"]),
    });
    expect(v.map((x) => x.code)).toEqual(["CURRENCY_MISMATCH"]);
  });

  test("تاریخ نامعتبر در نرخ یا تاریخ مبنا پذیرفته نمی‌شود", () => {
    expect(() => validateRate(usdIrr(), { at: "not-a-date" })).toThrow(DomainValidationError);
    expect(() => validateRate(usdIrr({ validFrom: "۱۴۰۵/۰۸/۰۱" }), { at: "2026-10-27" })).toThrow(
      /قابل تفسیر نیست/,
    );
    expect(() => validateRate(usdIrr({ validTo: "bad" }), { at: "2026-10-27" })).toThrow(
      DomainValidationError,
    );
    expect(() => validateRate(usdIrr(), { at: "2026-10-27" })).not.toThrow();
  });

  test("نسبت تومان نامعتبر یا تبدیل غیردقیق رد می‌شود", () => {
    const ok = defaultIranPolicy("c1");
    expect(inputToRialMinor("1500", "IRT", ok)).toBe(15_000n);
    expect(rialToTomanDisplay(15_005n, ok)).toEqual({ toman: 1_500n, remainderRial: 5n });
    const zero = { ...ok, tomanToRialDenominator: 0n };
    expect(() => inputToRialMinor("1", "IRT", zero)).toThrow(DomainValidationError);
    expect(() => rialToTomanDisplay(10n, zero)).toThrow(DomainValidationError);
    const inexact = { ...ok, tomanToRialNumerator: 10n, tomanToRialDenominator: 3n };
    expect(() => inputToRialMinor("1", "IRT", inexact)).toThrow(/نسبت تومان/);
    expect(() => inputToRialMinor("1", "IRT", { ...ok, tomanToRialNumerator: -10n })).toThrow(
      DomainValidationError,
    );
  });

  test("تخصیص با itemId تکراری رد می‌شود", () => {
    expect(() =>
      allocateCost(100n, "QUANTITY", [
        { itemId: "A", valueBaseMinor: 1n, quantity: 1n, weight: 1n },
        { itemId: "A", valueBaseMinor: 1n, quantity: 1n, weight: 1n },
      ]),
    ).toThrow(/تکراری/);
  });
});

describe("تسعیر پایان دوره: اعتبار نرخ، snapshot و hash", () => {
  const items: OpenMonetaryItem[] = [
    {
      itemId: "AP-1",
      accountCode: "2101",
      partyId: "sup-1",
      currencyCode: "USD",
      foreignBalanceMinor: -100_000n,
      carryingBaseMinor: -500_000_000n,
    },
    {
      itemId: "BANK-1",
      accountCode: "1102",
      partyId: null,
      currencyCode: "USD",
      foreignBalanceMinor: 50_000n,
      carryingBaseMinor: 250_000_000n,
    },
  ];
  const closing = usdIrr({ id: "close-1", quoteUnits: "520000" });
  const snapFor = (rate = closing, id = "snap-close") =>
    takeRateSnapshot({
      id,
      documentId: "rev-1",
      documentVersion: 1,
      purpose: "REVALUATION",
      rate,
      selectedAt: "t",
      selectedBy: null,
    });
  const run = (over: Partial<Parameters<typeof computeRevaluation>[0]> = {}) =>
    computeRevaluation({
      companyId: "c1",
      fiscalPeriodId: "1405-08",
      valuationDate: "2026-11-21",
      baseCurrency: "IRR",
      closingRatePolicyVersion: "CLOSE-1",
      items,
      closingRates: new Map([["USD", closing]]),
      closingSnapshots: new Map([["USD", snapFor()]]),
      accounts: { unrealizedGainAccount: "7101", unrealizedLossAccount: "8101" },
      rounding: "HALF_UP",
      registry: reg,
      ...over,
    });

  test("نرخ تأییدنشده یا خارج از تاریخ رد می‌شود", () => {
    const draft = usdIrr({ id: "close-1", quoteUnits: "520000", status: "DRAFT" });
    expect(() => run({ closingRates: new Map([["USD", draft]]) })).toThrow(
      expect.objectContaining({ code: "RATE_NOT_APPROVED" }),
    );
    const expired = usdIrr({
      id: "close-1",
      quoteUnits: "520000",
      validTo: "2026-11-01T00:00:00Z",
    });
    expect(() => run({ closingRates: new Map([["USD", expired]]) })).toThrow(
      expect.objectContaining({ code: "RATE_NOT_EFFECTIVE" }),
    );
  });

  test("snapshot نبود یا با نرخ نخواند → خطا", () => {
    expect(() => run({ closingSnapshots: new Map() })).toThrow(
      expect.objectContaining({ code: "FOREIGN_LINE_MISSING_RATE" }),
    );
    const other = snapFor(usdIrr({ id: "other-rate", quoteUnits: "510000" }), "snap-other");
    expect(() => run({ closingSnapshots: new Map([["USD", other]]) })).toThrow(
      expect.objectContaining({ code: "FOREIGN_LINE_MISSING_RATE" }),
    );
  });

  test("قلم تکراری در تسعیر رد می‌شود", () => {
    expect(() => run({ items: [items[0]!, items[0]!] })).toThrow(
      expect.objectContaining({ code: "REVALUATION_INVALID" }),
    );
  });

  test("hash مانده‌ها به ترتیب ورودی وابسته نیست", () => {
    expect(run({ items: [...items].reverse() }).sourceBalanceHash).toBe(run().sourceBalanceHash);
  });
});

describe("ایجنت‌ها و گزارش روزانه", () => {
  const ctx = (d: JournalDocument) => ({
    runId: "run-1",
    eventId: "evt-1",
    correlationId: "corr-1",
    rulesetVersion: "RS-2026.10",
    subject: { document: d },
  });

  test("هر سطر ارزی جداگانه برای snapshot بررسی می‌شود", async () => {
    const d = doc({
      lines: [
        {
          accountCode: "1102",
          currencyCode: "USD",
          foreignAmountMinor: 100n,
          rateSnapshotId: "snap-1",
          debitBaseMinor: 500n,
          creditBaseMinor: 0n,
        },
        {
          accountCode: "2101",
          currencyCode: "USD",
          foreignAmountMinor: 100n,
          debitBaseMinor: 0n,
          creditBaseMinor: 500n,
        },
      ],
    });
    const f = await new AccountingReviewAgent().review(ctx(d));
    const hit = f.find((x) => x.code === "FOREIGN_LINES_WITHOUT_RATE_CONTEXT");
    expect(hit).toBeDefined();
    expect(hit!.evidence.map((e) => e.field)).toEqual(["lines[1].rateSnapshotId"]);
    // سطر ریالی دارای snapshot نباید هشدار سطر ارزی بی‌نرخ را پنهان کند.
    const masked = doc({
      lines: [
        { ...d.lines[1]! },
        {
          accountCode: "1101",
          currencyCode: "IRR",
          rateSnapshotId: "snap-x",
          debitBaseMinor: 500n,
          creditBaseMinor: 0n,
        },
      ],
    });
    const f2 = await new AccountingReviewAgent().review(ctx(masked));
    expect(f2.map((x) => x.code)).toContain("FOREIGN_LINES_WITHOUT_RATE_CONTEXT");
    // همهٔ سطرهای ارزی بی‌نرخ در شواهد می‌آیند، نه فقط اولی.
    const two = doc({
      lines: [{ ...d.lines[1]! }, { ...d.lines[1]!, debitBaseMinor: 500n, creditBaseMinor: 0n }],
    });
    const f3 = await new AccountingReviewAgent().review(ctx(two));
    expect(
      f3.find((x) => x.code === "FOREIGN_LINES_WITHOUT_RATE_CONTEXT")!.evidence.map((e) => e.field),
    ).toEqual(["lines[0].rateSnapshotId", "lines[1].rateSnapshotId"]);
  });

  test("اجرای هم‌زمان ارکستراتور یافتهٔ تکراری نمی‌سازد", async () => {
    const repo = new InMemoryFindingRepository();
    const orch = new AgentOrchestrator({
      agents: [new AccountingReviewAgent()],
      findings: repo,
      ids: new SequentialIds(),
      clock: new FixedClock(),
      timeoutMs: 200,
    });
    const d = doc({ documentType: "PURCHASE_INVOICE", attachmentIds: [] });
    await Promise.all([orch.review(ctx(d)), orch.review(ctx(d))]);
    const codes = [...repo.findings.values()].map((f) => f.code);
    expect(codes.filter((c) => c === "MISSING_SUPPORTING_ATTACHMENT")).toHaveLength(1);
    // کلید یکتا در محدودهٔ شرکت است
    const other = doc({
      documentType: "PURCHASE_INVOICE",
      attachmentIds: [],
      scope: { ...scope, companyId: "c2" },
    });
    await orch.review(ctx(other));
    expect(
      [...repo.findings.values()].filter((f) => f.code === "MISSING_SUPPORTING_ATTACHMENT"),
    ).toHaveLength(2);
  });

  test("ترتیب گزارش با زمان ایجاد برابر پایدار است", () => {
    const base = {
      code: "X",
      severity: "WARNING" as const,
      confidence: 1,
      title: "t",
      explanation: "e",
      evidence: [],
      suggestedActions: [],
      sourceRefs: [],
      expiresAt: null,
      agent: "a",
      runId: "r",
      correlationId: "c",
      rulesetVersion: "v",
      documentId: "d",
      documentVersion: 1,
      companyId: "c1",
      branchId: "b1",
      blocking: false,
      dedupeKey: "k",
      status: "OPEN" as const,
      createdAt: "2026-10-27T08:00:00Z",
    };
    const fs = ["fnd-3", "fnd-1", "fnd-2"].map(
      (id) => ({ ...base, findingId: id, title: id }) as PersistedFinding,
    );
    const ids = (list: PersistedFinding[]) =>
      buildDailyManagerReport("c1", "2026-10-27", list).topItems.map((x) => x.findingId);
    expect(ids(fs)).toEqual(["fnd-1", "fnd-2", "fnd-3"]);
    expect(ids([...fs].reverse())).toEqual(["fnd-1", "fnd-2", "fnd-3"]);
  });
});

describe("تکمیل طبقه‌بندی سند Posted (جدول فعلی)", () => {
  const cur = {
    account_code: "6101",
    account_name: "هزینه",
    subsidiary_code: "01",
    subsidiary_name: "اداری",
    detail1_code: null,
    detail1_name: "",
    detail2_code: null,
    detail2_name: null,
  };

  test("مقایسهٔ دقیق: مقدار با فاصلهٔ اضافه تغییر حساب می‌شود", () => {
    expect(planPostedLineEnrichment(cur, { ...cur, subsidiary_code: " 01 x" }).error).toContain(
      "تغییر مقدار موجود",
    );
    // همان مقدار یا مقدار ارسالیِ نرمال‌شده که دقیقاً برابر است → بدون تغییر
    expect(planPostedLineEnrichment(cur, { ...cur }).fills).toEqual([]);
    const stored = { ...cur, subsidiary_code: " 01 " };
    expect(planPostedLineEnrichment(stored, { ...stored, subsidiary_code: "01" }).error).toContain(
      "تغییر مقدار موجود",
    );
    expect(planPostedLineEnrichment(stored, { ...stored }).error).toBeNull();
  });

  test("فقط فیلدهای خالی و با مقدار نرمال‌شده نوشته می‌شوند", () => {
    const plan = planPostedLineEnrichment(cur, {
      ...cur,
      detail1_code: "  P-1 ",
      detail1_name: " پروژه ",
      detail2_code: "   ",
    });
    expect(plan.error).toBeNull();
    expect(plan.fills).toEqual([
      { key: "detail1_code", value: "P-1" },
      { key: "detail1_name", value: "پروژه" },
    ]);
  });
});
