import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { rulesQuery } from "@/lib/compliance.functions";
import { SiteLayout, PageHeader } from "@/components/site-layout";
import { SeverityBadge, StatusBadge } from "@/components/severity-badge";

export const Route = createFileRoute("/rules/")({
  head: () => ({
    meta: [
      { title: "فهرست قواعد انطباق — هستهٔ حسابداری" },
      {
        name: "description",
        content:
          "فهرست قواعد انطباق مالیاتی و حسابرسی به تفکیک حوزه، شدت و وضعیت، همراه با نسخه و منبع رسمی هر قاعده.",
      },
      { property: "og:title", content: "فهرست قواعد انطباق — هستهٔ حسابداری" },
      {
        property: "og:description",
        content: "قواعد نسخه‌دار انطباق با فیلتر حوزه و شدت.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rulesQuery),
  component: RulesPage,
});

const DOMAIN_FA: Record<string, string> = {
  direct_tax: "مالیات مستقیم",
  vat: "ارزش افزوده",
  moadian: "سامانه مؤدیان",
  withholding: "کسر تکلیفی",
  accounting_standards: "استانداردهای حسابداری",
  auditing: "کنترل‌های حسابرسی",
};

function RulesPage() {
  const { data } = useSuspenseQuery(rulesQuery);
  const [domain, setDomain] = useState<string>("all");
  const rules = data.rules;
  const domains = Array.from(new Set(rules.map((r) => r.domain)));
  const shown = domain === "all" ? rules : rules.filter((r) => r.domain === domain);

  return (
    <SiteLayout>
      <PageHeader
        title="قواعد انطباق"
        lead="هر قاعده نسخه، بازهٔ اعتبار، سطح شدت و منبع رسمی خود را دارد. برای دیدن توضیح کامل و یادداشت آموزشی روی هر قاعده کلیک کنید."
      />

      {data.error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          خواندن داده‌ها ممکن نشد.
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setDomain("all")}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            domain === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          همه ({rules.length})
        </button>
        {domains.map((d) => (
          <button
            key={d}
            onClick={() => setDomain(d)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              domain === d
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {DOMAIN_FA[d] ?? d}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.map((rule) => (
          <Link
            key={rule.id}
            to="/rules/$ruleId"
            params={{ ruleId: rule.id }}
            className="block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {rule.rule_code} · v{rule.version}
              </span>
              <SeverityBadge severity={rule.severity} />
              <StatusBadge status={rule.status} />
            </div>
            <h2 className="mt-3 text-sm font-semibold">{rule.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm leading-7 text-muted-foreground">
              {rule.explanation}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              حوزه: {DOMAIN_FA[rule.domain] ?? rule.domain}
            </p>
          </Link>
        ))}
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">قاعده‌ای برای این حوزه ثبت نشده است.</p>
        ) : null}
      </div>
    </SiteLayout>
  );
}
