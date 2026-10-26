import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { SiteLayout, PageHeader } from "@/components/site-layout";
import { entriesQuery } from "@/lib/accounting.functions";
import { formatAmount, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ledger")({
  head: () => ({
    meta: [
      { title: "دفتر کل — هستهٔ حسابداری" },
      {
        name: "description",
        content: "دفتر کل ساخته‌شده از اسناد حسابداری شما: گردش بدهکار، بستانکار و مانده هر حساب.",
      },
      { property: "og:title", content: "دفتر کل — هستهٔ حسابداری" },
      { property: "og:description", content: "مانده و گردش هر حساب بر پایهٔ اسناد ثبت‌شده." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LedgerPage,
});

type Movement = {
  date: string;
  dateFa: string | null;
  documentNumber: string;
  description: string | null;
  debit: number;
  credit: number;
};

function LedgerPage() {
  const entries = useQuery(entriesQuery);
  const rows = entries.data?.entries ?? [];

  const accounts = new Map<
    string,
    { code: string; name: string; debit: number; credit: number; movements: Movement[] }
  >();

  for (const entry of rows) {
    for (const line of entry.journal_lines) {
      const key = line.account_code || line.account_name;
      const acc =
        accounts.get(key) ??
        { code: line.account_code, name: line.account_name, debit: 0, credit: 0, movements: [] };
      acc.debit += Number(line.debit || 0);
      acc.credit += Number(line.credit || 0);
      acc.movements.push({
        date: entry.entry_date,
        dateFa: entry.entry_date_fa,
        documentNumber: entry.document_number,
        description: line.description ?? entry.description,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      });
      accounts.set(key, acc);
    }
  }

  const list = Array.from(accounts.values()).sort((a, b) => a.code.localeCompare(b.code, "fa"));
  const totalDebit = list.reduce((s, a) => s + a.debit, 0);
  const totalCredit = list.reduce((s, a) => s + a.credit, 0);

  return (
    <SiteLayout>
      <PageHeader
        title="دفتر کل"
        lead="مانده و گردش هر حساب مستقیماً از سطرهای اسناد شما ساخته می‌شود؛ داده‌ای جداگانه نگهداری نمی‌شود."
      />

      {entries.isLoading ? <p className="text-sm text-muted-foreground">در حال بارگذاری…</p> : null}

      {list.length === 0 && !entries.isLoading ? (
        <p className="text-sm text-muted-foreground">
          هنوز سندی ثبت نشده است؛ دفتر کل پس از ثبت نخستین سند ساخته می‌شود.
        </p>
      ) : null}

      <div className="space-y-6">
        {list.map((acc) => {
          const balance = acc.debit - acc.credit;
          return (
            <section key={acc.code + acc.name} className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
                <div>
                  <span className="font-mono text-xs text-muted-foreground">{acc.code}</span>
                  <h2 className="text-sm font-semibold">{acc.name}</h2>
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
                    </tr>
                  </thead>
                  <tbody>
                    {acc.movements.map((m, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-3">{m.dateFa || formatDate(m.date)}</td>
                        <td className="p-3 font-mono text-xs">{m.documentNumber}</td>
                        <td className="p-3 text-muted-foreground">{m.description || "—"}</td>
                        <td className="p-3">{formatAmount(m.debit)}</td>
                        <td className="p-3">{formatAmount(m.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {list.length > 0 ? (
        <p className="mt-6 text-xs text-muted-foreground">
          جمع کل بدهکار {formatAmount(totalDebit)} ریال و جمع کل بستانکار{" "}
          {formatAmount(totalCredit)} ریال است.
        </p>
      ) : null}
    </SiteLayout>
  );
}
