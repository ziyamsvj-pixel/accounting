import { createFileRoute } from "@tanstack/react-router";

import { SiteLayout, PageHeader } from "@/components/site-layout";
import { LedgerView } from "@/components/ledger-view";

export const Route = createFileRoute("/_authenticated/subsidiary-ledger")({
  head: () => ({
    meta: [
      { title: "دفتر معین — هستهٔ حسابداری" },
      { name: "description", content: "گردش و مانده حساب‌های معین بر پایهٔ اسناد ثبت‌شده." },
      { property: "og:title", content: "دفتر معین — هستهٔ حسابداری" },
      { property: "og:description", content: "گردش و مانده حساب‌های معین." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <SiteLayout>
      <PageHeader
        title="دفتر معین"
        lead="گردش هر حساب معین همراه با حساب کل مربوط و ماندهٔ جاری."
      />
      <LedgerView
        level="subsidiary"
        emptyText="هنوز سطری با حساب معین ثبت نشده است؛ هنگام ثبت سند، کد و نام معین را وارد کنید."
      />
    </SiteLayout>
  ),
});
