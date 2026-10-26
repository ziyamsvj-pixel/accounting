import { hashOf } from "@/domain/hash";
import type { DomainViolation } from "@/domain/errors";
import type {
  Agent,
  AgentFinding,
  AgentRunContext,
  AgentRunRecord,
  FindingRepository,
  PersistedFinding,
} from "./types";

export interface OrchestratorDeps {
  agents: readonly Agent[];
  findings: FindingRepository;
  ids: { next(prefix?: string): string };
  clock: { nowIso(): string };
  timeoutMs?: number;
  /** ثبت خطای ایجنت در observability. */
  onAgentError?: (info: { agent: string; eventId: string; error: string }) => void;
}

/** dedupe روی سند + نسخه + کد + نسخهٔ قواعد + hash شواهد؛ یافتهٔ ردشده با همین شواهد دوباره ساخته نمی‌شود. */
export function dedupeKeyOf(
  ctx: AgentRunContext,
  agent: string,
  f: Pick<AgentFinding, "code" | "evidence">,
): string {
  const d = ctx.subject.document;
  return [
    d.documentId,
    d.version,
    agent,
    f.code,
    ctx.rulesetVersion,
    hashOf(f.evidence).slice(0, 16),
  ].join(":");
}

/**
 * اجرای هم‌زمان ایجنت‌ها با timeout؛ شکست یک ایجنت بقیه را متوقف نمی‌کند و سند را تغییر نمی‌دهد.
 * خطاهای قطعی Domain (در صورت ارسال) به‌صورت Finding با blocking=true و منشأ DOMAIN ثبت می‌شوند؛
 * خروجی ایجنت هرگز blocking نیست.
 */
export class AgentOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async review(
    ctx: AgentRunContext,
    domainViolations: readonly DomainViolation[] = [],
  ): Promise<{ findings: PersistedFinding[]; runs: AgentRunRecord[] }> {
    const persisted: PersistedFinding[] = [];
    const runs: AgentRunRecord[] = [];
    const d = ctx.subject.document;

    // یافته‌های Domain (تنها منبع blocking)
    if (domainViolations.length > 0) {
      const domainFindings: AgentFinding[] = domainViolations.map((v) => ({
        code: `DOMAIN_${v.code}`,
        severity: "HIGH_RISK",
        confidence: 1,
        title: "خطای قطعی Domain",
        explanation: v.message,
        evidence: [
          {
            field: v.lineIndex !== undefined ? `lines[${v.lineIndex}]` : "document",
            observedValue: v.code,
            source: "DOMAIN",
          },
        ],
        suggestedActions: [
          {
            code: "FIX_DOCUMENT",
            label: "اصلاح سند پیش از ثبت قطعی",
            requiresHumanApproval: false,
          },
        ],
        sourceRefs: [],
        expiresAt: null,
      }));
      persisted.push(...(await this.persist(ctx, "domain-invariants", domainFindings, true)));
    }

    const timeoutMs = this.deps.timeoutMs ?? 30_000;
    const results = await Promise.all(
      this.deps.agents.map(async (agent) => {
        const startedAt = this.deps.clock.nowIso();
        try {
          const out = await withTimeout(agent.review(ctx), timeoutMs);
          return { agent, startedAt, out, error: null as string | null, timedOut: false };
        } catch (err) {
          const timedOut = err instanceof TimeoutError;
          return {
            agent,
            startedAt,
            out: [] as AgentFinding[],
            error: err instanceof Error ? err.message : String(err),
            timedOut,
          };
        }
      }),
    );

    for (const r of results) {
      let saved: PersistedFinding[] = [];
      if (r.error)
        this.deps.onAgentError?.({ agent: r.agent.name, eventId: ctx.eventId, error: r.error });
      else saved = await this.persist(ctx, r.agent.name, r.out, false);
      persisted.push(...saved);
      const run: AgentRunRecord = {
        runId: `${ctx.runId}:${r.agent.name}`,
        agent: r.agent.name,
        agentVersion: r.agent.version,
        eventId: ctx.eventId,
        correlationId: ctx.correlationId,
        documentId: d.documentId,
        documentVersion: d.version,
        rulesetVersion: ctx.rulesetVersion,
        status: r.error ? (r.timedOut ? "TIMED_OUT" : "FAILED") : "SUCCEEDED",
        findingCount: saved.length,
        error: r.error,
        startedAt: r.startedAt,
        finishedAt: this.deps.clock.nowIso(),
      };
      await this.deps.findings.saveRun(run);
      runs.push(run);
    }
    return { findings: persisted, runs };
  }

  private async persist(
    ctx: AgentRunContext,
    agent: string,
    list: readonly AgentFinding[],
    fromDomain: boolean,
  ): Promise<PersistedFinding[]> {
    const d = ctx.subject.document;
    const out: PersistedFinding[] = [];
    for (const f of list) {
      const severity = (f.severity as string) === "BLOCKING" ? "HIGH_RISK" : f.severity; // ایجنت حق BLOCKING ندارد
      const dedupeKey = dedupeKeyOf(ctx, agent, f);
      const rec: PersistedFinding = {
        ...f,
        severity,
        findingId: this.deps.ids.next("fnd"),
        agent,
        runId: ctx.runId,
        correlationId: ctx.correlationId,
        rulesetVersion: ctx.rulesetVersion,
        documentId: d.documentId,
        documentVersion: d.version,
        companyId: d.scope.companyId,
        branchId: d.scope.branchId,
        blocking: fromDomain,
        dedupeKey,
        status: "OPEN",
        createdAt: this.deps.clock.nowIso(),
      };
      // بررسی و درج در یک گام اتمیک؛ دو اجرای هم‌زمان یافتهٔ تکراری نمی‌سازند.
      if (await this.deps.findings.saveIfAbsent(rec)) out.push(rec);
    }
    return out;
  }
}

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => timer && clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(`agent timeout after ${ms}ms`)), ms);
    }),
  ]);
}

export class InMemoryFindingRepository implements FindingRepository {
  readonly findings = new Map<string, PersistedFinding>();
  readonly runs: AgentRunRecord[] = [];
  private readonly byKey = new Map<string, string>();
  async findByDedupeKey(companyId: string, k: string) {
    const id = this.byKey.get(`${companyId}|${k}`);
    return id ? (this.findings.get(id) ?? null) : null;
  }
  async saveIfAbsent(f: PersistedFinding) {
    const key = `${f.companyId}|${f.dedupeKey}`;
    if (this.byKey.has(key)) return false;
    this.byKey.set(key, f.findingId);
    this.findings.set(f.findingId, f);
    return true;
  }
  async saveRun(r: AgentRunRecord) {
    this.runs.push(r);
  }
  async listOpen(companyId: string) {
    return [...this.findings.values()].filter(
      (f) => f.companyId === companyId && (f.status === "OPEN" || f.status === "ESCALATED"),
    );
  }
}
