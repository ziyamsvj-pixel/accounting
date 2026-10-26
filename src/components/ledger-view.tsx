import { useQuery } from "@tanstack/react-query";

import { entriesQuery, type JournalLine } from "@/lib/accounting.functions";
import { formatAmount, formatDate } from "@/lib/format";

// سطح دفتر: کل، معین، تفصیلی ۱ و تفصیلی ۲
export type LedgerLevel = "general" | "subsidiary" | "detail1" | "detail2";

function keyOf(line: JournalLine, level: LedgerLevel) {
  const parent = `${line.account_code} ${line.account_name}`;
  if (level === "general") return { code: line.account_code, name: line.account_name, parent: "" };
  if (level === "subsidiary")
    return { code: line.subsidiary_code, name: line.subsidiary_name, parent };
  if (level === "detail1") return { code: line.detail1_code, name: line.detail1_name, parent };
  return { code: line.detail2_code, name: line.detail2_name, parent };
}

type Movement = {
  date: string;
  dateFa: string | null;
  documentNumber: string;
  description: string | null;
  debit: number;
  credit: number;
};

export function LedgerView({ level, emptyText }: { level: LedgerLevel; emptyText: string }) {
  const entries = useQuery(entriesQuery);
  const rows = entries.data?.entries ?? [];
  const accounts = new Map<
    string,
    { code: string; name: string; parent: string; debit: number; credit: number; movements: Movement[] }
  >();

  for (const entry of rows) {
    for (const line of entry.journal_lines) {
      const k = keyOf(line, level);
      if (!k.code && !k.name) continue;
      const key = `${k.code ?? ""}|${k.name ?? ""}`;
      const acc = accounts.get(key) ?? {
        code: k.code ?? "",
        name: k.name ?? "",
        parent: k.parent,
        debit: 0,
        credit: 0,
        movements: [],
      };
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      acc.debit += debit;
      acc.credit += credit;
      acc.movements.push({
        date: entry.entry_date,
        dateFa: entry.entry_date_fa,
        documentNumber: entry.document_number,
        description: line.description ?? entry.description,
        debit,
        credit,
      });
      accounts.set(key, acc);
    }
  }

  const list = Array.from(accounts.values()).sort((a, b) => a.code.localeCompare(b.code, "fa"));
  const totalDebit = list.reduce((s, a) => s + a.debit, 0);
  const totalCredit = list.reduce((s, a) => s + a.credit, 0);

  return (
    <>
      {entries.isLoading ? <p className="text-sm text-muted-foreground">در حال بارگذاری…</p> : null}
      {list.length === 0 && !entries.isLoading ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : null}
      <div className="space-y-6">
        {list.map((acc) => {
          const balance = acc.debit - acc.credit;
          let running = 0;
          return (
            <section key={acc.code + acc.name} className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">{acc.code}</span>
                  <h2 className="text-sm font-semibold">{acc.name}</h2>
                  {acc.parent ? (
                    <p className="text-xs text-muted-foreground">حساب کل: {acc.parent}</p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  مانده: {formatAmount(Math.abs(balance))} ریال{" "}
                  {balance === 0 ? "" : balance > 0 ? "(بدهکار)" : "(بستانکار)"}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3">تاریخ</th>
                      <th className="p-3">شماره سند</th>
                      <th className="p-3">شرح</th>
                      <th className="p-3">بدهکار</th>
                      <th className="p-3">بستانکار</th>
                      <th className="p-3">مانده</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acc.movements.map((m, i) => {
                      running += m.debit - m.credit;
                      return (
                        <tr key={i} className="border-t border-border">
                          <td className="p-3">{m.dateFa || formatDate(m.date)}</td>
                          <td className="p-3 font-mono text-xs">{m.documentNumber}</td>
                          <td className="p-3 text-muted-foreground">{m.description || "—"}</td>
                          <td className="p-3">{formatAmount(m.debit)}</td>
                          <td className="p-3">{formatAmount(m.credit)}</td>
                          <td className="p-3">
                            {formatAmount(Math.abs(running))}{" "}
                            {running === 0 ? "" : running > 0 ? "بد" : "بس"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
      {list.length > 0 ? (
        <p className="mt-6 text-xs text-muted-foreground">
          جمع بدهکار {formatAmount(totalDebit)} ریال و جمع بستانکار {formatAmount(totalCredit)} ریال.
        </p>
      ) : null}
    </>
  );
}
