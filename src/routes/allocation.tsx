import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { allocationBasesQuery } from "@/lib/compliance.functions";
import { SiteLayout, PageHeader } from "@/components/site-layout";

export const Route = createFileRoute("/allocation")({
  head: () => ({
    meta: [
      { title: "تخصیص هزینه‌های مشترک — هستهٔ حسابداری" },
      {
        name: "description",
        content:
          "ماشین‌حساب تخصیص هزینه‌های مشترک میان فعالیت‌های معاف، مشمول و نرخ صفر بر پایهٔ مبانی مستند.",
      },
      { property: "og:title", content: "تخصیص هزینه‌های مشترک — هستهٔ حسابداری" },
      {
        property: "og:description",
        content: "محاسبهٔ سهم هر فعالیت از هزینهٔ مشترک بر اساس مبنای انتخابی و ضرایب واردشده.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allocationBasesQuery),
  component: AllocationPage,
});

type Line = { id: number; label: string; weight: string };

const DEFAULT_LINES: Line[] = [
  { id: 1, label: "درآمد مشمول", weight: "600000000" },
  { id: 2, label: "درآمد معاف", weight: "300000000" },
  { id: 3, label: "درآمد با نرخ صفر", weight: "100000000" },
];

const fmt = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });

function AllocationPage() {
  const { data } = useSuspenseQuery(allocationBasesQuery);
  const bases = data.bases;
  const [basisKey, setBasisKey] = useState(bases[0]?.basis_key ?? "revenue_ratio");
  const [gross, setGross] = useState("120000000");
  const [lines, setLines] = useState<Line[]>(DEFAULT_LINES);

  const basis = bases.find((b) => b.basis_key === basisKey);

  const result = useMemo(() => {
    const total = lines.reduce((s, l) => s + (Number(l.weight) || 0), 0);
    const g = Number(gross) || 0;
    return lines.map((l) => {
      const w = Number(l.weight) || 0;
      const share = total > 0 ? w / total : 0;
      return { ...l, share, amount: g * share };
    });
  }, [lines, gross]);

  const allocated = result.reduce((s, r) => s + r.amount, 0);

  function update(id: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  return (
    <SiteLayout>
      <PageHeader
        title="تخصیص هزینه‌های مشترک"
        lead="هزینهٔ ناخالص را وارد کنید، مبنای تخصیص را انتخاب کنید و ضریب هر فعالیت را بنویسید. نتیجه فقط محاسبهٔ کمکی است و ثبت آن نیازمند مستندات و تأیید کاربر مسئول است."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5 rounded-lg border border-border bg-card p-6">
          <div>
            <label className="text-xs text-muted-foreground">هزینهٔ ناخالص (ریال)</label>
            <input
              value={gross}
              onChange={(e) => setGross(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">مبنای تخصیص</label>
            <select
              value={basisKey}
              onChange={(e) => setBasisKey(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {bases.map((b) => (
                <option key={b.id} value={b.basis_key}>
                  {b.title_fa}
                </option>
              ))}
            </select>
            {basis ? (
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{basis.description}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-sm font-semibold">فعالیت‌ها و ضرایب</h2>
            <div className="mt-4 space-y-3">
              {lines.map((l) => (
                <div key={l.id} className="flex flex-wrap gap-2">
                  <input
                    value={l.label}
                    onChange={(e) => update(l.id, { label: e.target.value })}
                    className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    value={l.weight}
                    inputMode="numeric"
                    onChange={(e) =>
                      update(l.id, { weight: e.target.value.replace(/[^0-9.]/g, "") })
                    }
                    className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}
                    className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                setLines((p) => [
                  ...p,
                  { id: (p.at(-1)?.id ?? 0) + 1, label: "فعالیت جدید", weight: "0" },
                ])
              }
              className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              افزودن فعالیت
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-right text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">فعالیت</th>
                  <th className="px-4 py-3 font-medium">درصد سهم</th>
                  <th className="px-4 py-3 font-medium">مبلغ تخصیص‌یافته (ریال)</th>
                </tr>
              </thead>
              <tbody>
                {result.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 bg-card">
                    <td className="px-4 py-3">{r.label}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {fmt.format(r.share * 100)}٪
                    </td>
                    <td className="px-4 py-3 font-medium">{fmt.format(Math.round(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40 text-sm font-semibold">
                  <td className="px-4 py-3">جمع</td>
                  <td className="px-4 py-3">۱۰۰٪</td>
                  <td className="px-4 py-3">{fmt.format(Math.round(allocated))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
