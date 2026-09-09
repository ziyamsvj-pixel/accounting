import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { rulesQuery, sourcesQuery } from "@/lib/compliance.functions";
import { SiteLayout } from "@/components/site-layout";
import { SeverityBadge, StatusBadge } from "@/components/severity-badge";

export const Route = createFileRoute("/rules/$ruleId")({
  head: () => ({
    meta: [
      { title: "جزئیات قاعدهٔ انطباق — هستهٔ حسابداری" },
      {
        name: "description",
        content:
          "توضیح کامل قاعدهٔ انطباق، سطح شدت، بازهٔ اعتبار، یادداشت آموزشی و منبع رسمی مرتبط.",
      },
      { property: "og:title", content: "جزئیات قاعدهٔ انطباق — هستهٔ حسابداری" },
      {
        property: "og:description",
        content: "شدت، وضعیت، بازهٔ اعتبار و منبع رسمی یک قاعدهٔ انطباق.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(rulesQuery),
      context.queryClient.ensureQueryData(sourcesQuery),
    ]),
  component: RuleDetail,
});

const DOMAIN_FA: Record<string, string> = {
  direct_tax: "مالیات مستقیم",
  vat: "ارزش افزوده",
  moadian: "سامانه مؤدیان",
  withholding: "کسر تکلیفی",
  accounting_standards: "استانداردهای حسابداری",
  auditing: "کنترل‌های حسابرسی",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-3 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-left">{value}</span>
    </div>
  );
}

function RuleDetail() {
  const { ruleId } = Route.useParams();
  const { data } = useSuspenseQuery(rulesQuery);
  const { data: srcData } = useSuspenseQuery(sourcesQuery);
  const rule = data.rules.find((r) => r.id === ruleId);

  if (!rule) {
    return (
      <SiteLayout>
        <h1 className="text-xl font-semibold">این قاعده پیدا نشد</h1>
        <Link to="/rules" className="mt-4 inline-block text-sm text-primary underline">
          بازگشت به فهرست قواعد
        </Link>
      </SiteLayout>
    );
  }

  const source = srcData.sources.find((s) => s.id === rule.source_id);

  return (
    <SiteLayout>
      <Link to="/rules" className="text-xs text-muted-foreground hover:text-foreground">
        → بازگشت به فهرست قواعد
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {rule.rule_code} · v{rule.version}
        </span>
        <SeverityBadge severity={rule.severity} />
        <StatusBadge status={rule.status} />
      </div>
      <h1 className="mt-3 text-2xl font-bold leading-relaxed sm:text-3xl">{rule.title}</h1>

      <section className="mt-8 rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">شرح قاعده</h2>
        <p className="mt-3 text-sm leading-8 text-muted-foreground">{rule.explanation}</p>
      </section>

      {rule.education_note ? (
        <section className="mt-4 rounded-lg border border-border bg-muted/40 p-6">
          <h2 className="text-sm font-semibold">یادداشت آموزشی</h2>
          <p className="mt-3 text-sm leading-8 text-muted-foreground">{rule.education_note}</p>
        </section>
      ) : null}

      <section className="mt-4 rounded-lg border border-border bg-card px-6 py-2">
        <Row label="حوزه" value={DOMAIN_FA[rule.domain] ?? rule.domain} />
        <Row label="اولویت اجرا" value={String(rule.priority)} />
        <Row label="از تاریخ" value={rule.effective_from ?? "—"} />
        <Row label="تا تاریخ" value={rule.effective_to ?? "بدون محدودیت"} />
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">منبع رسمی</h2>
        {source ? (
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p className="text-foreground">{source.title}</p>
            <p>مرجع صادرکننده: {source.authority}</p>
            <p>شمارهٔ سند: {source.document_number ?? "—"}</p>
            <p>ارجاع رسمی: {source.official_reference ?? "—"}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            منبعی به این قاعده متصل نشده است؛ تا زمان تأیید منبع، قاعده فعال نمی‌شود.
          </p>
        )}
      </section>
    </SiteLayout>
  );
}
