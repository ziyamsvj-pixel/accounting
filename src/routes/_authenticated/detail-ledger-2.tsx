import { createFileRoute } from "@tanstack/react-router";

import { SiteLayout, PageHeader } from "@/components/site-layout";
import { LedgerView } from "@/components/ledger-view";

export const Route = createFileRoute("/_authenticated/detail-ledger-2")({
  head: () => ({
    meta: [
      { title: "دفتر تفصیلی ۲ — هستهٔ حسابداری" },
      { name: "description", content: "گردش و مانده حساب‌های تفصیلی سطح دو." },
      { property: "og:title", content: "دفتر تفصیلی ۲ — هستهٔ حسابداری" },
      { property: "og:description", content: "گردش و مانده حساب‌های تفصیلی سطح دو." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <SiteLayout>
      <PageHeader title="دفتر تفصیلی ۲" lead="گردش هر حساب تفصیلی سطح دو با ماندهٔ جاری." />
      <LedgerView level="detail2" emptyText="هنوز سطری با تفصیلی ۲ ثبت نشده است." />
    </SiteLayout>
  ),
});
