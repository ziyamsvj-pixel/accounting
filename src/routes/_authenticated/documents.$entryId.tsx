import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { SiteLayout, PageHeader } from "@/components/site-layout";
import { entryQuery } from "@/lib/accounting.functions";
import { rulesQuery } from "@/lib/compliance.functions";
import { evaluateEntry, summarize, OUTCOME_FA, type CheckOutcome } from "@/lib/compliance-engine";
import { SeverityBadge } from "@/components/severity-badge";
import { formatAmount, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/documents/$entryId")({
  head: () => ({
    meta: [
      { title: "بررسی انطباق سند — هستهٔ حسابداری" },
      {
        name: "description",
        content: "تطبیق خودکار یک سند حسابداری با قواعد انطباق ذخیره‌شده و نمایش نتیجهٔ هر قاعده.",
      },
      { property: "og:title", content: "بررسی انطباق سند — هستهٔ حسابداری" },
      { property: "og:description", content: "نتیجهٔ قاعده‌به‌قاعدهٔ انطباق سند." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EntryPage,
});

const OUTCOME_CLASS: Record<CheckOutcome, string> = {
  pass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  attention: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  fail: "bg-destructive/15 text-destructive",
  manual: "bg-muted text-muted-foreground",
};

function EntryPage() {
  const { entryId } = Route.useParams();
  const entryRes = useQuery(entryQuery(entryId));
  const rulesRes = useQuery(rulesQuery);

  const entry = entryRes.data?.entry ?? null;
  const rules = rulesRes.data?.rules ?? [];

  if (entryRes.isLoading || rulesRes.isLoading) {
    return (
      <SiteLayout>
        <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
      </SiteLayout>
    );
  }

  if (!entry) {
    return (
      <SiteLayout>
        <PageHeader title="سند یافت نشد" lead="این سند وجود ندارد یا به شما تعلق ندارد." />
        <Link to="/documents" className="text-sm underline">
          بازگشت به فهرست اسناد
        </Link>
      </SiteLayout>
    );
  }

  const results = evaluateEntry(entry, rules);
  const stats = summarize(results);
  const totalDebit = entry.journal_lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = entry.journal_lines.reduce((s, l) => s + Number(l.credit || 0), 0);

  return (
    <SiteLayout>
      <PageHeader
        title={`سند شماره ${entry.document_number}`}
        lead={entry.description || "بدون شرح"}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="تاریخ" value={entry.entry_date_fa || formatDate(entry.entry_date)} />
        <Stat label="جمع بدهکار" value={`${formatAmount(totalDebit)} ریال`} />
        <Stat label="جمع بستانکار" value={`${formatAmount(totalCredit)} ریال`} />
      </div>

      <div className="mb-8 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-right text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="p-3">کد حساب</th>
              <th className="p-3">نام حساب</th>
              <th className="p-3">بدهکار</th>
              <th className="p-3">بستانکار</th>
              <th className="p-3">شرح</th>
            </tr>
          </thead>
          <tbody>
            {entry.journal_lines.map((line) => (
              <tr key={line.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{line.account_code}</td>
                <td className="p-3">{line.account_name}</td>
                <td className="p-3">{formatAmount(line.debit)}</td>
                <td className="p-3">{formatAmount(line.credit)}</td>
                <td className="p-3 text-muted-foreground">{line.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-semibold">ماشین‌حساب انطباق</h2>
      <p className="mb-4 text-xs leading-6 text-muted-foreground">
        {`مغایر: ${stats.fail} · نیازمند توجه: ${stats.attention} · منطبق: ${stats.pass} · بررسی دستی: ${stats.manual}`}
        {" — نتایج بر پایهٔ قواعد نمونه است و جایگزین نظر کارشناس مالیاتی نیست."}
      </p>

      <div className="space-y-3">
        {results.map((r) => (
          <div key={r.rule.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${OUTCOME_CLASS[r.outcome]}`}
              >
                {OUTCOME_FA[r.outcome]}
              </span>
              <SeverityBadge severity={r.rule.severity} />
              <Link
                to="/rules/$ruleId"
                params={{ ruleId: r.rule.id }}
                className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                {r.rule.rule_code}
              </Link>
            </div>
            <p className="mt-2 text-sm font-medium">{r.rule.title}</p>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">{r.message}</p>
          </div>
        ))}
      </div>
    </SiteLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
