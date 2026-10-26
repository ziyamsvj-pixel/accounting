import type { PersistedFinding, Severity } from "./types";

export interface DailyManagerReport {
  companyId: string;
  date: string;
  totals: Record<Severity, number>;
  blockingCount: number;
  byAgent: Record<string, number>;
  byBranch: Record<string, number>;
  topItems: {
    findingId: string;
    title: string;
    severity: Severity;
    documentId: string;
    agent: string;
  }[];
}

const RANK: Record<Severity, number> = { BLOCKING: 0, HIGH_RISK: 1, WARNING: 2, INFO: 3 };

/** گزارش روزانهٔ کارتابل مدیر از یافته‌های باز؛ تولید Pure از داده. */
export function buildDailyManagerReport(
  companyId: string,
  date: string,
  open: readonly PersistedFinding[],
  top = 10,
): DailyManagerReport {
  const totals: Record<Severity, number> = { INFO: 0, WARNING: 0, HIGH_RISK: 0, BLOCKING: 0 };
  const byAgent: Record<string, number> = {};
  const byBranch: Record<string, number> = {};
  let blockingCount = 0;
  const mine = open.filter((f) => f.companyId === companyId);
  for (const f of mine) {
    totals[f.severity] += 1;
    if (f.blocking) blockingCount += 1;
    byAgent[f.agent] = (byAgent[f.agent] ?? 0) + 1;
    const b = f.branchId ?? "—";
    byBranch[b] = (byBranch[b] ?? 0) + 1;
  }
  const topItems = [...mine]
    .sort(
      (a, b) =>
        Number(b.blocking) - Number(a.blocking) ||
        RANK[a.severity] - RANK[b.severity] ||
        (a.createdAt < b.createdAt ? -1 : 1),
    )
    .slice(0, top)
    .map((f) => ({
      findingId: f.findingId,
      title: f.title,
      severity: f.severity,
      documentId: f.documentId,
      agent: f.agent,
    }));
  return { companyId, date, totals, blockingCount, byAgent, byBranch, topItems };
}
