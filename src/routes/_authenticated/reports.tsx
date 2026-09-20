import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { SiteLayout, PageHeader } from "@/components/site-layout";
import { entriesQuery, type EntryWithLines, type JournalLine } from "@/lib/accounting.functions";
import { formatAmount, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "گزارش‌های مالی — هستهٔ حسابداری" },
      {
        name: "description",
        content: "ترازنامه و دفاتر معین و تفصیلی بر اساس اسناد قطعی حسابداری.",
      },
    ],
  }),
  component: ReportsPage,
});

type LedgerLevel = "subsidiary" | "detail_1" | "detail_2";
type LedgerRow = {
  code: string;
  name: string;
  level: LedgerLevel;
  debit: number;
  credit: number;
  movements: Movement[];
};
type Movement = {
  date: string;
  dateFa: string | null;
  documentNumber: string;
  description: string;
  debit: number;
  credit: number;
};

const LEVEL_FA: Record<LedgerLevel, string> = {
  subsidiary: "دفتر معین",
  detail_1: "تفصیلی ۱",
  detail_2: "تفصیلی ۲",
};

function accountLevel(code: string): LedgerLevel {
  const normalized = code.replace(/\D/g, "");
  if (normalized.length >= 8) return "detail_2";
  if (normalized.length >= 6) return "detail_1";
  return "subsidiary";
}

function postedEntries(entries: EntryWithLines[]): EntryWithLines[] {
  return entries.filter((entry) => entry.status === "posted" || entry.status === "locked");
}

function ReportsPage() {
  const entries = useQuery(entriesQuery);
  const [level, setLevel] = useState<LedgerLevel>("subsidiary");

  const posted = useMemo(() => postedEntries(entries.data?.entries ?? []), [entries.data?.entries]);
  const ledger = useMemo(() => buildLedger(posted, level), [posted, level]);
  const balance = useMemo(() => buildBalanceSheet(posted), [posted]);

  return (
    <SiteLayout>
      <PageHeader
        title="گزارش‌های مالی"
        lead="گزارش‌ها فقط از اسناد ثبت قطعی یا قفل‌شده ساخته می‌شوند؛ پیش‌نویس و سند تأییدنشده در ماندهٔ مالی وارد نمی‌شوند."
      />

      {entries.isLoading ? <p className="text-sm text-muted-foreground">در حال بارگذاری…</p> : null}
      {entries.data?.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {entries.data.error}
        </p>
      ) : null}

      <section className="mb-8 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">ترازنامهٔ نمونهٔ جاری</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <BalanceColumn title="دارایی‌ها" rows={balance.assets} total={balance.assetsTotal} />
          <BalanceColumn
            title="بدهی‌ها و حقوق مالکانه"
            rows={balance.liabilitiesAndEquity}
            total={balance.liabilitiesAndEquityTotal}
          />
        </div>
        <div className="mt-5 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <span className="font-medium">کنترل تراز: </span>
          دارایی {formatAmount(balance.assetsTotal)} ریال در برابر بدهی و حقوق مالکانه{" "}
          {formatAmount(balance.liabilitiesAndEquityTotal)} ریال؛ اختلاف{" "}
          <strong>
            {formatAmount(Math.abs(balance.assetsTotal - balance.liabilitiesAndEquityTotal))}
          </strong>{" "}
          ریال.
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">دفاتر معین و تفصیلی</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {posted.length} سند قطعی/قفل‌شده در محاسبه وارد شده است.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LEVEL_FA) as LedgerLevel[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLevel(item)}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  level === item
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                {LEVEL_FA[item]}
              </button>
            ))}
          </div>
        </div>

        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            برای این سطح حساب هنوز گردش قطعی وجود ندارد.
          </p>
        ) : (
          <div className="space-y-5">
            {ledger.map((account) => (
              <LedgerCard key={account.code} account={account} />
            ))}
          </div>
        )}
      </section>
    </SiteLayout>
  );
}

function BalanceColumn({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { code: string; name: string; amount: number }[];
  total: number;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.code}
            className="flex items-center justify-between border-b border-border/60 py-2 text-sm"
          >
            <span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">{row.code}</span>
              {row.name}
            </span>
            <span>{formatAmount(row.amount)} ریال</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 text-sm font-semibold">
          <span>جمع</span>
          <span>{formatAmount(total)} ریال</span>
        </div>
      </div>
    </div>
  );
}

function LedgerCard({ account }: { account: LedgerRow }) {
  const balance = account.debit - account.credit;
  return (
    <article className="overflow-hidden rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 p-4">
        <div>
          <span className="font-mono text-xs text-muted-foreground">{account.code}</span>
          <h3 className="text-sm font-semibold">{account.name}</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          بدهکار {formatAmount(account.debit)} · بستانکار {formatAmount(account.credit)} · مانده{" "}
          {formatAmount(Math.abs(balance))} {balance >= 0 ? "بدهکار" : "بستانکار"}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="bg-muted/20 text-xs text-muted-foreground">
            <tr>
              <th className="p-3">تاریخ</th>
              <th className="p-3">شماره</th>
              <th className="p-3">شرح</th>
              <th className="p-3">بدهکار</th>
              <th className="p-3">بستانکار</th>
            </tr>
          </thead>
          <tbody>
            {account.movements.map((movement, index) => (
              <tr key={`${movement.documentNumber}-${index}`} className="border-t border-border">
                <td className="p-3">{movement.dateFa || formatDate(movement.date)}</td>
                <td className="p-3 font-mono text-xs">{movement.documentNumber}</td>
                <td className="p-3 text-muted-foreground">{movement.description || "—"}</td>
                <td className="p-3">{formatAmount(movement.debit)}</td>
                <td className="p-3">{formatAmount(movement.credit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function buildLedger(entries: EntryWithLines[], selectedLevel: LedgerLevel): LedgerRow[] {
  const accounts = new Map<string, LedgerRow>();
  for (const entry of entries) {
    for (const line of entry.journal_lines as JournalLine[]) {
      const code = line.account_code || "بدون کد";
      if (accountLevel(code) !== selectedLevel) continue;
      const current = accounts.get(code) ?? {
        code,
        name: line.account_name,
        level: selectedLevel,
        debit: 0,
        credit: 0,
        movements: [],
      };
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      current.debit += debit;
      current.credit += credit;
      current.movements.push({
        date: entry.entry_date,
        dateFa: entry.entry_date_fa,
        documentNumber: entry.document_number,
        description: line.description ?? entry.description ?? "",
        debit,
        credit,
      });
      accounts.set(code, current);
    }
  }
  return [...accounts.values()].sort((a, b) => a.code.localeCompare(b.code, "fa"));
}

function buildBalanceSheet(entries: EntryWithLines[]) {
  const groups = new Map<string, { code: string; name: string; amount: number }>();
  for (const entry of entries) {
    for (const line of entry.journal_lines) {
      const code = line.account_code || "0";
      const root = code.slice(0, 1);
      const current = groups.get(root) ?? { code: root, name: groupName(root), amount: 0 };
      current.amount += Number(line.debit || 0) - Number(line.credit || 0);
      groups.set(root, current);
    }
  }
  const value = (root: string) => groups.get(root)?.amount ?? 0;
  const assets = ["1"]
    .map((root) => ({ ...groups.get(root)!, amount: value(root) }))
    .filter((x) => x.amount);
  const liabilitiesAndEquity = [
    { code: "2", name: groupName("2"), amount: -value("2") },
    { code: "3", name: groupName("3"), amount: -value("3") },
    {
      code: "4/5",
      name: "سود (زیان) دوره",
      amount: -(value("4") + value("5")),
    },
  ].filter((x) => x.amount);
  return {
    assets,
    assetsTotal: assets.reduce((sum, row) => sum + row.amount, 0),
    liabilitiesAndEquity,
    liabilitiesAndEquityTotal: liabilitiesAndEquity.reduce((sum, row) => sum + row.amount, 0),
  };
}

function groupName(code: string) {
  return (
    {
      "1": "دارایی‌ها",
      "2": "بدهی‌ها",
      "3": "حقوق مالکانه",
      "4": "درآمدها",
      "5": "هزینه‌ها",
    }[code] ?? "سایر حساب‌ها"
  );
}
