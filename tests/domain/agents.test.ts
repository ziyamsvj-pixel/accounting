import { describe, expect, test } from "bun:test";
import {
  AccountingReviewAgent,
  AgentOrchestrator,
  AnomalyReviewAgent,
  ComplianceReviewAgent,
  DocumentReviewAgent,
  InMemoryFindingRepository,
  LedgerIntegrityAgent,
  buildDailyManagerReport,
} from "@/agents";
import type { Agent, AgentRunContext, HistoryReader, LedgerIntegrityReader } from "@/agents";
import { FixedClock, SequentialIds } from "@/application/in-memory";
import { CurrencyRegistry, checkPostingInvariants, rebuildProjection } from "@/domain";
import type { JournalDocument } from "@/domain";
import { accounts, doc, openPeriod } from "./fixtures";

const ctxFor = (
  d: JournalDocument,
  extra: Partial<AgentRunContext["subject"]> = {},
): AgentRunContext => ({
  runId: "run-1",
  eventId: "evt-1",
  correlationId: "corr-1",
  rulesetVersion: "RS-2026.10",
  subject: { document: d, ...extra },
});

const noHistory: HistoryReader = {
  recentAmounts: async () => [],
  similarDocuments: async () => [],
};

function orchestrator(agents: Agent[], repo = new InMemoryFindingRepository(), timeoutMs = 200) {
  return {
    repo,
    orch: new AgentOrchestrator({
      agents,
      findings: repo,
      ids: new SequentialIds(),
      clock: new FixedClock(),
      timeoutMs,
    }),
  };
}

describe("ایجنت‌ها: اخطار غیرمسدودکننده", () => {
  test("فاکتور خرید بدون پیوست → WARNING، نه blocking", async () => {
    const { orch } = orchestrator([new AccountingReviewAgent(), new ComplianceReviewAgent()]);
    const r = await orch.review(
      ctxFor(doc({ documentType: "PURCHASE_INVOICE", attachmentIds: [] })),
    );
    const codes = r.findings.map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining(["MISSING_SUPPORTING_ATTACHMENT", "TAX_SOURCE_REVIEW_REQUIRED"]),
    );
    expect(r.findings.every((f) => f.blocking === false)).toBe(true);
    expect(r.runs.every((x) => x.status === "SUCCEEDED")).toBe(true);
  });

  test("OCR: عدم همسانی شناسهٔ فروشنده و مبلغ", async () => {
    const { orch } = orchestrator([new DocumentReviewAgent()]);
    const r = await orch.review(
      ctxFor(doc({ documentType: "PURCHASE_INVOICE" }), {
        declaredVendorNationalId: "10101010",
        ocr: [
          {
            attachmentId: "att-1",
            vendorNationalId: "20202020",
            totalMinor: 1_400_000n,
            confidence: 0.92,
          },
        ],
      }),
    );
    expect(r.findings.map((f) => [f.code, f.severity])).toEqual([
      ["VENDOR_ID_MISMATCH", "HIGH_RISK"],
      ["INVOICE_TOTAL_MISMATCH", "WARNING"],
    ]);
  });

  test("ایجنتی که BLOCKING برگرداند به HIGH_RISK غیرمسدودکننده تنزل می‌یابد", async () => {
    const rogue: Agent = {
      name: "rogue",
      version: "0",
      review: async () => [
        {
          code: "X",
          severity: "BLOCKING" as never,
          confidence: 1,
          title: "x",
          explanation: "x",
          evidence: [],
          suggestedActions: [],
          sourceRefs: [],
          expiresAt: null,
        },
      ],
    };
    const { orch } = orchestrator([rogue]);
    const r = await orch.review(ctxFor(doc()));
    expect(r.findings[0]!.severity).toBe("HIGH_RISK");
    expect(r.findings[0]!.blocking).toBe(false);
  });

  test("فقط خطای Domain blocking است", async () => {
    const { orch } = orchestrator([new AccountingReviewAgent()]);
    const bad = doc({
      status: "APPROVED",
      lines: [
        { accountCode: "1000", currencyCode: "IRR", debitBaseMinor: 1n, creditBaseMinor: 0n },
        { accountCode: "1101", currencyCode: "IRR", debitBaseMinor: 0n, creditBaseMinor: 2n },
      ],
    });
    const violations = checkPostingInvariants(bad, {
      period: openPeriod,
      accounts,
      currencies: new CurrencyRegistry(),
      rateSnapshotIds: new Set(),
    });
    const r = await orch.review(ctxFor(bad), violations);
    const blocking = r.findings.filter((f) => f.blocking);
    expect(blocking.map((f) => f.code).sort()).toEqual([
      "DOMAIN_GROUP_ACCOUNT_POSTING",
      "DOMAIN_UNBALANCED_ENTRY",
    ]);
    expect(blocking.every((f) => f.agent === "domain-invariants")).toBe(true);
  });

  test("شکست یا timeout یک ایجنت بقیه را متوقف نمی‌کند", async () => {
    const crash: Agent = {
      name: "crash",
      version: "1",
      review: async () => {
        throw new Error("OCR service down");
      },
    };
    const slow: Agent = { name: "slow", version: "1", review: () => new Promise(() => {}) };
    const errors: string[] = [];
    const repo = new InMemoryFindingRepository();
    const orch = new AgentOrchestrator({
      agents: [crash, slow, new AccountingReviewAgent()],
      findings: repo,
      ids: new SequentialIds(),
      clock: new FixedClock(),
      timeoutMs: 50,
      onAgentError: (e) => errors.push(e.agent),
    });
    const r = await orch.review(ctxFor(doc({ documentType: "EXPENSE", attachmentIds: [] })));
    expect(r.runs.map((x) => [x.agent, x.status])).toEqual([
      ["crash", "FAILED"],
      ["slow", "TIMED_OUT"],
      ["accounting-review", "SUCCEEDED"],
    ]);
    expect(errors.sort()).toEqual(["crash", "slow"]);
    expect(r.findings.map((f) => f.code)).toContain("MISSING_SUPPORTING_ATTACHMENT");
  });

  test("یافتهٔ ردشده (DISMISSED) با همان شواهد دوباره ساخته نمی‌شود", async () => {
    const { orch, repo } = orchestrator([new AccountingReviewAgent()]);
    const d = doc({ documentType: "EXPENSE", attachmentIds: [] });
    const first = await orch.review(ctxFor(d));
    for (const f of first.findings) repo.findings.set(f.findingId, { ...f, status: "DISMISSED" });
    const second = await orch.review(ctxFor(d));
    expect(second.findings).toHaveLength(0);
    const nextVersion = await orch.review(ctxFor({ ...d, version: 2 }));
    expect(nextVersion.findings.length).toBeGreaterThan(0);
  });

  test("ایجنت هیچ تغییری روی سند نمی‌دهد", async () => {
    const { orch } = orchestrator([
      new AccountingReviewAgent(),
      new DocumentReviewAgent(),
      new ComplianceReviewAgent(),
      new AnomalyReviewAgent(noHistory),
    ]);
    const d = Object.freeze(doc({ status: "POSTED", documentType: "EXPENSE", attachmentIds: [] }));
    const before = JSON.stringify(d, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    await orch.review(ctxFor(d));
    expect(JSON.stringify(d, (_, v) => (typeof v === "bigint" ? v.toString() : v))).toBe(before);
  });
});

describe("کنترل دفتر و ناهنجاری", () => {
  test("LedgerIntegrity با بازسازی کل Journal مقایسه می‌کند (نه یک سند)", async () => {
    const posted = [
      doc({ documentId: "a", status: "POSTED" }),
      doc({ documentId: "b", status: "POSTED" }),
    ];
    const truth = rebuildProjection(posted);
    const reader = (projectionOffset: bigint): LedgerIntegrityReader => ({
      journalTotals: async (c, p, code) => truth.get(`GENERAL|${c}|${p}|${code}`)!,
      projectionTotals: async (c, p, code) => {
        const t = truth.get(`GENERAL|${c}|${p}|${code}`)!;
        return code === "6101" ? { ...t, debitMinor: t.debitMinor + projectionOffset } : t;
      },
    });
    // دو سند روی یک حساب: نسخهٔ نمونهٔ قبلی اینجا اختلاف کاذب می‌داد.
    const ok = await new LedgerIntegrityAgent(reader(0n)).review(ctxFor(posted[1]!));
    expect(ok).toEqual([]);
    const bad = await new LedgerIntegrityAgent(reader(5n)).review(ctxFor(posted[1]!));
    expect(bad.map((f) => f.code)).toEqual(["LEDGER_PROJECTION_MISMATCH"]);
    expect(
      await new LedgerIntegrityAgent(reader(5n)).review(ctxFor(doc({ status: "DRAFT" }))),
    ).toEqual([]);
  });

  test("مبلغ غیرعادی و احتمال ثبت تکراری", async () => {
    const history: HistoryReader = {
      recentAmounts: async () => [100_000n, 120_000n, 90_000n, 110_000n, 100_000n],
      similarDocuments: async () => [{ documentId: "old-7", entryDate: "2026-10-25" }],
    };
    const f = await new AnomalyReviewAgent(history).review(
      ctxFor(
        doc({
          lines: [
            {
              accountCode: "6101",
              currencyCode: "IRR",
              debitBaseMinor: 5_000_000n,
              creditBaseMinor: 0n,
              partyId: "p1",
            },
            {
              accountCode: "1101",
              currencyCode: "IRR",
              debitBaseMinor: 0n,
              creditBaseMinor: 5_000_000n,
            },
          ],
        }),
      ),
    );
    expect(f.map((x) => x.code).sort()).toEqual(["POSSIBLE_DUPLICATE", "UNUSUAL_AMOUNT"]);
  });

  test("گزارش روزانهٔ مدیر", async () => {
    const { orch, repo } = orchestrator([new AccountingReviewAgent(), new ComplianceReviewAgent()]);
    await orch.review(
      ctxFor(doc({ documentType: "PURCHASE_INVOICE", attachmentIds: [], description: null })),
    );
    const rep = buildDailyManagerReport("c1", "2026-10-27", await repo.listOpen("c1"));
    expect(rep.totals.WARNING).toBe(1);
    expect(rep.totals.INFO).toBe(2);
    expect(rep.byBranch["b1"]).toBe(3);
    expect(rep.topItems[0]!.severity).toBe("WARNING");
  });
});
