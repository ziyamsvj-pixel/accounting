import { hashOf } from "./hash";
import type { JournalDocument } from "./journal";

/**
 * Journal منبع حقیقت است؛ دفاتر روزنامه، کل، معین و تفصیلی Projection قابل بازسازی‌اند.
 */
export type LedgerLevel = "GENERAL" | "SUBSIDIARY" | "DETAIL1" | "DETAIL2";

export interface LedgerTotals {
  debitMinor: bigint;
  creditMinor: bigint;
  lineCount: number;
}

export type LedgerProjection = Map<string, LedgerTotals>;

export function ledgerKey(
  level: LedgerLevel,
  companyId: string,
  fiscalPeriodId: string,
  code: string,
): string {
  return `${level}|${companyId}|${fiscalPeriodId}|${code}`;
}

function add(map: LedgerProjection, key: string, d: bigint, c: bigint): void {
  const cur = map.get(key) ?? { debitMinor: 0n, creditMinor: 0n, lineCount: 0 };
  map.set(key, {
    debitMinor: cur.debitMinor + d,
    creditMinor: cur.creditMinor + c,
    lineCount: cur.lineCount + 1,
  });
}

/** فقط اسناد POSTED یا REVERSED (که قبلاً Post شده‌اند) اثر دفتری دارند. */
export function applyToProjection(map: LedgerProjection, doc: JournalDocument): void {
  if (doc.status !== "POSTED" && doc.status !== "REVERSED") return;
  const { companyId } = doc.scope;
  for (const l of doc.lines) {
    add(
      map,
      ledgerKey("GENERAL", companyId, doc.fiscalPeriodId, l.accountCode),
      l.debitBaseMinor,
      l.creditBaseMinor,
    );
    if (l.subsidiaryCode)
      add(
        map,
        ledgerKey(
          "SUBSIDIARY",
          companyId,
          doc.fiscalPeriodId,
          `${l.accountCode}/${l.subsidiaryCode}`,
        ),
        l.debitBaseMinor,
        l.creditBaseMinor,
      );
    if (l.detail1Code)
      add(
        map,
        ledgerKey("DETAIL1", companyId, doc.fiscalPeriodId, l.detail1Code),
        l.debitBaseMinor,
        l.creditBaseMinor,
      );
    if (l.detail2Code)
      add(
        map,
        ledgerKey("DETAIL2", companyId, doc.fiscalPeriodId, l.detail2Code),
        l.debitBaseMinor,
        l.creditBaseMinor,
      );
  }
}

export function rebuildProjection(docs: Iterable<JournalDocument>): LedgerProjection {
  const map: LedgerProjection = new Map();
  for (const d of docs) applyToProjection(map, d);
  return map;
}

export function projectionHash(map: LedgerProjection): string {
  const rows = [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return hashOf(rows.map(([k, v]) => [k, v.debitMinor, v.creditMinor, v.lineCount]));
}

export interface ReconciliationDifference {
  key: string;
  expected: LedgerTotals | null;
  actual: LedgerTotals | null;
}

/** مقایسهٔ Read Model ذخیره‌شده با بازسازی از Journal. اصلاح خودکار انجام نمی‌شود. */
export function reconcile(
  expected: LedgerProjection,
  actual: LedgerProjection,
): {
  ok: boolean;
  expectedHash: string;
  actualHash: string;
  differences: ReconciliationDifference[];
} {
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  const differences: ReconciliationDifference[] = [];
  for (const k of [...keys].sort()) {
    const e = expected.get(k) ?? null;
    const a = actual.get(k) ?? null;
    if (
      !e ||
      !a ||
      e.debitMinor !== a.debitMinor ||
      e.creditMinor !== a.creditMinor ||
      e.lineCount !== a.lineCount
    ) {
      differences.push({ key: k, expected: e, actual: a });
    }
  }
  return {
    ok: differences.length === 0,
    expectedHash: projectionHash(expected),
    actualHash: projectionHash(actual),
    differences,
  };
}

/** تراز آزمایشی ساده از Projection (سطح کل). */
export function trialBalance(
  map: LedgerProjection,
  companyId: string,
  fiscalPeriodId: string,
): { code: string; debitMinor: bigint; creditMinor: bigint; balanceMinor: bigint }[] {
  const prefix = `GENERAL|${companyId}|${fiscalPeriodId}|`;
  return [...map.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => ({
      code: k.slice(prefix.length),
      debitMinor: v.debitMinor,
      creditMinor: v.creditMinor,
      balanceMinor: v.debitMinor - v.creditMinor,
    }))
    .sort((a, b) => (a.code < b.code ? -1 : 1));
}
