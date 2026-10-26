import { beforeEach, describe, expect, test } from "bun:test";
import { JournalService } from "@/application/journal-service";
import { FixedClock, InMemoryUnitOfWork, SequentialIds } from "@/application/in-memory";
import { InMemoryOutboxStore, OutboxDispatcher } from "@/application/outbox-dispatcher";
import { DomainValidationError, buildReversal, editDraft, transition } from "@/domain";
import {
  accounts,
  clerk,
  clerk2,
  doc,
  manager,
  openPeriod,
  outsider,
  rialLines,
  scope,
  viewer,
} from "./fixtures";

function setup() {
  const uow = new InMemoryUnitOfWork();
  uow.state.periods.set(openPeriod.id, openPeriod);
  uow.state.charts.set("c1", accounts);
  const clock = new FixedClock();
  const svc = new JournalService(uow, new SequentialIds(), clock);
  return { uow, svc, clock };
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

describe("Workflow خالص", () => {
  test("Draft → Submit → Approve → Post", () => {
    let d = doc({ status: "DRAFT" });
    d = transition(d, "SUBMIT", clerk, "t");
    d = transition(d, "APPROVE", manager, "t");
    d = transition(d, "POST", manager, "t");
    expect(d.status).toBe("POSTED");
    expect(d.version).toBe(4);
    expect(d.postedBy).toBe(manager.userId);
  });
  test("انتقال نامعتبر", () => {
    expect(() => transition(doc({ status: "DRAFT" }), "POST", manager, "t")).toThrow(
      expect.objectContaining({ code: "INVALID_TRANSITION" }),
    );
  });
  test("نقش‌ها: کاربر باجه نمی‌تواند تأیید یا Post کند؛ بیننده نمی‌تواند ارسال کند", () => {
    expect(() => transition(doc({ status: "SUBMITTED" }), "APPROVE", clerk2, "t")).toThrow(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
    expect(() => transition(doc({ status: "DRAFT" }), "SUBMIT", viewer, "t")).toThrow(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });
  test("تفکیک وظایف: ایجادکننده تأیید نمی‌کند", () => {
    expect(() =>
      transition(doc({ status: "SUBMITTED", createdBy: manager.userId }), "APPROVE", manager, "t"),
    ).toThrow(expect.objectContaining({ code: "SEGREGATION_OF_DUTIES" }));
  });
  test("مرز Tenant/Company/Branch", () => {
    expect(() => transition(doc({ status: "DRAFT" }), "SUBMIT", outsider, "t")).toThrow(
      expect.objectContaining({ code: "TENANT_SCOPE_VIOLATION" }),
    );
    const otherBranch = { ...clerk, branchIds: ["b2"] };
    expect(() => transition(doc({ status: "DRAFT" }), "SUBMIT", otherBranch, "t")).toThrow(
      expect.objectContaining({ code: "TENANT_SCOPE_VIOLATION" }),
    );
  });
  test("سند Posted قابل ویرایش مستقیم نیست", () => {
    expect(() => editDraft(doc({ status: "POSTED" }), { description: "x" }, manager, 1)).toThrow(
      expect.objectContaining({ code: "POSTED_IMMUTABLE" }),
    );
  });
  test("قفل خوش‌بینانه در ویرایش", () => {
    expect(() =>
      editDraft(doc({ status: "DRAFT", version: 3 }), { description: "x" }, clerk, 2),
    ).toThrow(expect.objectContaining({ code: "CONCURRENCY_CONFLICT" }));
  });
  test("سند برگشتی سطرها را معکوس می‌کند", () => {
    const rev = buildReversal(doc({ status: "POSTED", documentNumber: "1405-08-000001" }), {
      documentId: "r1",
      idempotencyKey: "idem-rev-1",
      entryDate: "2026-10-28",
      fiscalPeriodId: openPeriod.id,
      actor: manager,
      at: "t",
      reason: "اشتباه مبلغ",
    });
    expect(rev.lines[0]!.creditBaseMinor).toBe(1_500_000n);
    expect(rev.lines[0]!.debitBaseMinor).toBe(0n);
    expect(rev.status).toBe("DRAFT");
    expect(rev.reversalOfId).toBe("d1");
  });
});

describe("JournalService — ثبت هم‌زمان چند باجه", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  test("چرخهٔ کامل با شمارهٔ قطعی، hash، Outbox و Audit", async () => {
    const { svc, uow } = ctx;
    const c = await svc.createDraft(draftInput(), { actor: clerk, idempotencyKey: "k-create-1" });
    expect(c.status).toBe("DRAFT");
    expect(c.draftWarnings).toEqual([]);
    const s = await svc.submit(c.documentId, c.version, {
      actor: clerk,
      idempotencyKey: "k-submit-1",
    });
    const a = await svc.approve(s.documentId, s.version, {
      actor: manager,
      idempotencyKey: "k-approve-1",
    });
    const p = await svc.post(a.documentId, a.version, {
      actor: manager,
      idempotencyKey: "k-post-1",
    });
    expect(p.status).toBe("POSTED");
    expect(p.documentNumber).toBe("1405-08-000001");
    const stored = uow.state.journals.get(p.documentId)!;
    expect(stored.contentHash).toHaveLength(64);
    expect(uow.state.outbox.map((e) => e.type)).toEqual([
      "journal.created",
      "journal.submitted",
      "journal.approved",
      "journal.posted",
    ]);
    expect(new Set(uow.state.outbox.map((e) => e.correlationId)).size).toBe(4);
    expect(uow.state.audit.map((x) => x.action)).toEqual([
      "CREATE_DRAFT",
      "SUBMIT",
      "APPROVE",
      "POST",
    ]);
  });

  test("Draft نامتوازن ذخیره می‌شود اما اخطار می‌گیرد و ارسال نمی‌شود", async () => {
    const { svc } = ctx;
    const lines = [...rialLines()];
    lines[1] = { ...lines[1]!, creditBaseMinor: 1n };
    const c = await svc.createDraft(
      { ...draftInput(), lines },
      { actor: clerk, idempotencyKey: "k-unbal-1" },
    );
    expect(c.status).toBe("DRAFT");
    expect(c.draftWarnings.map((w) => w.code)).toContain("UNBALANCED_ENTRY");
    await expect(
      svc.submit(c.documentId, c.version, { actor: clerk, idempotencyKey: "k-unbal-2" }),
    ).rejects.toMatchObject({ code: "UNBALANCED_ENTRY" });
  });

  test("دوبار کلیک/ارسال مجدد با همان کلید → یک سند", async () => {
    const { svc, uow } = ctx;
    const [r1, r2] = await Promise.all([
      svc.createDraft(draftInput(), { actor: clerk, idempotencyKey: "k-dup-0001" }),
      svc.createDraft(draftInput(), { actor: clerk, idempotencyKey: "k-dup-0001" }),
    ]);
    expect(r1.documentId).toBe(r2.documentId);
    expect([r1.replayed, r2.replayed].sort()).toEqual([false, true]);
    expect(uow.state.journals.size).toBe(1);
  });

  test("همان کلید با بدنهٔ متفاوت رد می‌شود", async () => {
    const { svc } = ctx;
    await svc.createDraft(draftInput(), { actor: clerk, idempotencyKey: "k-reuse-01" });
    await expect(
      svc.createDraft(draftInput(2n), { actor: clerk, idempotencyKey: "k-reuse-01" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  test("دو کاربر هم‌زمان روی یک نسخه: یکی موفق، دیگری CONCURRENCY_CONFLICT", async () => {
    const { svc, uow } = ctx;
    const c = await svc.createDraft(draftInput(), {
      actor: manager,
      idempotencyKey: "k-conc-0001",
    });
    const results = await Promise.allSettled([
      svc.updateDraft(
        c.documentId,
        c.version,
        { description: "نسخهٔ الف" },
        { actor: manager, idempotencyKey: "k-conc-a001" },
      ),
      svc.updateDraft(
        c.documentId,
        c.version,
        { description: "نسخهٔ ب" },
        { actor: manager, idempotencyKey: "k-conc-b001" },
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(DomainValidationError);
    expect(rejected.reason.code).toBe("CONCURRENCY_CONFLICT");
    expect(uow.state.journals.get(c.documentId)!.version).toBe(2);
  });

  test("ده باجه هم‌زمان: شمارهٔ قطعی یکتا و پیوسته", async () => {
    const { svc, uow } = ctx;
    const ids: { id: string; v: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const c = await svc.createDraft(draftInput(BigInt(1000 + i)), {
        actor: clerk,
        idempotencyKey: `k-many-c-${i}`,
      });
      const s = await svc.submit(c.documentId, c.version, {
        actor: clerk,
        idempotencyKey: `k-many-s-${i}`,
      });
      const a = await svc.approve(s.documentId, s.version, {
        actor: manager,
        idempotencyKey: `k-many-a-${i}`,
      });
      ids.push({ id: a.documentId, v: a.version });
    }
    const posted = await Promise.all(
      ids.map((x, i) => svc.post(x.id, x.v, { actor: manager, idempotencyKey: `k-many-p-${i}` })),
    );
    const numbers = posted.map((p) => p.documentNumber!).sort();
    expect(new Set(numbers).size).toBe(10);
    expect(numbers[0]).toBe("1405-08-000001");
    expect(numbers[9]).toBe("1405-08-000010");
    expect(uow.state.sequences.get("c1|1405-08")).toBe(10);
  });

  test("شکست Posting تراکنش را کامل برمی‌گرداند (اتمیک)", async () => {
    const { svc, uow } = ctx;
    const c = await svc.createDraft(draftInput(), { actor: clerk, idempotencyKey: "k-atom-c01" });
    const s = await svc.submit(c.documentId, c.version, {
      actor: clerk,
      idempotencyKey: "k-atom-s01",
    });
    const a = await svc.approve(s.documentId, s.version, {
      actor: manager,
      idempotencyKey: "k-atom-a01",
    });
    uow.state.periods.set(openPeriod.id, { ...openPeriod, status: "CLOSED" });
    const outboxBefore = uow.state.outbox.length;
    await expect(
      svc.post(a.documentId, a.version, { actor: manager, idempotencyKey: "k-atom-p01" }),
    ).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
    expect(uow.state.journals.get(a.documentId)!.status).toBe("APPROVED");
    expect(uow.state.outbox.length).toBe(outboxBefore);
    expect(uow.state.sequences.size).toBe(0);
  });

  test("Posted در Repository تغییرناپذیر است؛ اصلاح فقط با Reversal", async () => {
    const { svc, uow } = ctx;
    const c = await svc.createDraft(draftInput(), { actor: clerk, idempotencyKey: "k-rev-c001" });
    const s = await svc.submit(c.documentId, c.version, {
      actor: clerk,
      idempotencyKey: "k-rev-s001",
    });
    const a = await svc.approve(s.documentId, s.version, {
      actor: manager,
      idempotencyKey: "k-rev-a001",
    });
    const p = await svc.post(a.documentId, a.version, {
      actor: manager,
      idempotencyKey: "k-rev-p001",
    });
    await expect(
      svc.updateDraft(
        p.documentId,
        p.version,
        { description: "x" },
        { actor: manager, idempotencyKey: "k-rev-u001" },
      ),
    ).rejects.toMatchObject({ code: "POSTED_IMMUTABLE" });

    const r = await svc.createReversal(
      p.documentId,
      { entryDate: "2026-10-28", fiscalPeriodId: openPeriod.id, reason: "اشتباه" },
      { actor: manager, idempotencyKey: "k-rev-r001" },
    );
    const rs = await svc.submit(r.documentId, r.version, {
      actor: manager,
      idempotencyKey: "k-rev-r002",
    });
    // تفکیک وظایف: تأیید سند برگشتی توسط کاربر دیگری با نقش admin
    const manager2 = { ...manager, userId: "u-mgr2" };
    const ra = await svc.approve(rs.documentId, rs.version, {
      actor: manager2,
      idempotencyKey: "k-rev-r003",
    });
    const rp = await svc.post(ra.documentId, ra.version, {
      actor: manager2,
      idempotencyKey: "k-rev-r004",
    });
    expect(rp.documentNumber).toBe("1405-08-000002");
    const done = await svc.completeReversal(rp.documentId, {
      actor: manager,
      idempotencyKey: "k-rev-r005",
    });
    expect(done.status).toBe("REVERSED");
    expect(uow.state.journals.get(p.documentId)!.reversedById).toBe(rp.documentId);
    await expect(
      svc.createReversal(
        p.documentId,
        { entryDate: "2026-10-29", fiscalPeriodId: openPeriod.id, reason: "دوباره" },
        { actor: manager, idempotencyKey: "k-rev-r006" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  test("کلید idempotency کوتاه یا خالی رد می‌شود", async () => {
    await expect(
      ctx.svc.createDraft(draftInput(), { actor: clerk, idempotencyKey: "x" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
});

describe("Outbox Dispatcher — Retry و Dead Letter", () => {
  test("موفق، تلاش مجدد و انتقال به Dead Letter", async () => {
    const { svc, uow, clock } = setup();
    await svc.createDraft(draftInput(), { actor: clerk, idempotencyKey: "k-ob-0001" });
    await svc.createDraft(draftInput(7n), { actor: clerk, idempotencyKey: "k-ob-0002" });
    const store = new InMemoryOutboxStore(() => uow.state.outbox);
    const failing = new Set([uow.state.outbox[1]!.eventId]);
    const handled: string[] = [];
    const disp = new OutboxDispatcher(
      store,
      async (e) => {
        if (failing.has(e.eventId)) throw new Error("agent down");
        handled.push(e.eventId);
      },
      clock,
      3,
      1000,
    );
    expect(await disp.tick()).toEqual({ done: 1, retried: 1, dead: 0 });
    expect(await disp.tick()).toEqual({ done: 0, retried: 0, dead: 0 }); // هنوز زمان retry نرسیده
    clock.set("2026-10-27T08:00:01.000Z");
    expect(await disp.tick()).toEqual({ done: 0, retried: 1, dead: 0 });
    clock.set("2026-10-27T08:00:10.000Z");
    expect(await disp.tick()).toEqual({ done: 0, retried: 0, dead: 1 });
    expect(uow.state.outbox[1]!.status).toBe("DEAD");
    expect(uow.state.outbox[1]!.lastError).toBe("agent down");
    expect(handled).toHaveLength(1);
  });
});
