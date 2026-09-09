import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { sourcesQuery } from "@/lib/compliance.functions";
import { SiteLayout, PageHeader } from "@/components/site-layout";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "منابع مقرراتی — هستهٔ حسابداری" },
      {
        name: "description",
        content:
          "فهرست منابع رسمی قوانین و مقررات مالیاتی با مرجع صادرکننده، شمارهٔ سند، تاریخ اثر و وضعیت راستی‌آزمایی.",
      },
      { property: "og:title", content: "منابع مقرراتی — هستهٔ حسابداری" },
      {
        property: "og:description",
        content: "منابع رسمی مبنای قواعد انطباق، همراه با وضعیت راستی‌آزمایی.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(sourcesQuery),
  component: SourcesPage,
});

const VERIFICATION: Record<string, string> = {
  verified: "تأییدشده",
  unverified: "تأییدنشده",
  pending: "در انتظار بررسی",
};

const DOC_TYPE: Record<string, string> = {
  law: "قانون",
  regulation: "آیین‌نامه",
  circular: "بخشنامه",
  standard: "استاندارد",
  guideline: "دستورالعمل",
};

function SourcesPage() {
  const { data } = useSuspenseQuery(sourcesQuery);

  return (
    <SiteLayout>
      <PageHeader
        title="منابع مقرراتی"
        lead="هر قاعده باید به یک منبع رسمی متصل باشد. تا زمانی که منبع راستی‌آزمایی نشود، قاعدهٔ متکی بر آن فعال نمی‌شود."
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-right text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">عنوان سند</th>
              <th className="px-4 py-3 font-medium">مرجع</th>
              <th className="px-4 py-3 font-medium">نوع</th>
              <th className="px-4 py-3 font-medium">شماره</th>
              <th className="px-4 py-3 font-medium">تاریخ اثر</th>
              <th className="px-4 py-3 font-medium">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.id} className="border-t border-border/60 bg-card">
                <td className="px-4 py-3">{s.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.authority}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {DOC_TYPE[s.document_type] ?? s.document_type}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {s.document_number ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{s.effective_date ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {VERIFICATION[s.verification_status] ?? s.verification_status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.sources.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">هنوز منبعی ثبت نشده است.</p>
      ) : null}
    </SiteLayout>
  );
}
