import { createFileRoute } from "@tanstack/react-router";

import { SiteLayout, PageHeader } from "@/components/site-layout";
import { LedgerView } from "@/components/ledger-view";

export const Route = createFileRoute("/_authenticated/detail-ledger-1")({
  head: () => ({
    meta: [
      { title: "دفتر تفصیلی ۱ — هستهٔ حسابداری" },
      { name: "description", content: "گردش و مانده حساب‌های تفصیلی سطح یک." },
      { property: "og:title", content: "دفتر تفصیلی ۱ — هستهٔ حسابداری" },
      { property: "og:description", content: "گردش و مانده حساب‌های تفصیلی سطح یک." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <SiteLayout>
      <PageHeader title="دفتر تفصیلی ۱" lead="گردش هر حساب تفصیلی سطح یک با ماندهٔ جاری." />
      <LedgerView level="detail1" emptyText="هنوز سطری با تفصیلی ۱ ثبت نشده است." />
    </SiteLayout>
  ),
});
