import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { SiteLayout, PageHeader } from "@/components/site-layout";
import { entryQuery, updateEntryLines, accessQuery } from "@/lib/accounting.functions";
import { formatAmount, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/documents/$entryId/edit")({
  head: () => ({
    meta: [
      { title: "ویرایش سطرهای سند — هستهٔ حسابداری" },
      {
        name: "description",
        content: "ویرایش کد و نام حساب معین و تفصیلی سطرهای یک سند حسابداری ثبت‌شده.",
      },
      { property: "og:title", content: "ویرایش سطرهای سند — هستهٔ حسابداری" },
      { property: "og:description", content: "تکمیل حساب معین و تفصیلی برای اسناد قدیمی." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditEntryPage,
});

type EditableLine = {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  subsidiary_code: string;
  subsidiary_name: string;
  detail1_code: string;
  detail1_name: string;
  detail2_code: string;
  detail2_name: string;
};

function EditEntryPage() {
  const { entryId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const entryRes = useQuery(entryQuery(entryId));
  const accessRes = useQuery(accessQuery);
  const submit = useServerFn(updateEntryLines);

  const [lines, setLines] = useState<EditableLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entry = entryRes.data?.entry ?? null;

  useEffect(() => {
    if (entry && lines === null) {
      setLines(
        entry.journal_lines.map((l) => ({
          id: l.id,
          account_code: l.account_code,
          account_name: l.account_name,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          subsidiary_code: l.subsidiary_code ?? "",
          subsidiary_name: l.subsidiary_name ?? "",
          detail1_code: l.detail1_code ?? "",
          detail1_name: l.detail1_name ?? "",
          detail2_code: l.detail2_code ?? "",
          detail2_name: l.detail2_name ?? "",
        })),
      );
    }
  }, [entry, lines]);

  if (entryRes.isLoading || accessRes.isLoading) {
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

  if (!accessRes.data?.canEdit) {
    return (
      <SiteLayout>
        <PageHeader
          title="دسترسی ویرایش ندارید"
          lead="نقش شما فقط خواندنی است؛ برای ویرایش سطرها به نقش ویرایشگر یا مدیر نیاز دارید."
        />
        <Link
          to="/documents/$entryId"
          params={{ entryId }}
          className="text-sm underline"
        >
          بازگشت به سند
        </Link>
      </SiteLayout>
    );
  }

  function update(i: number, patch: Partial<EditableLine>) {
    setLines((prev) => prev?.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) ?? prev);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lines) return;
    setBusy(true);
    setError(null);
    const res = await submit({
      data: {
        entryId,
        lines: lines.map((l) => ({
          id: l.id,
          account_code: l.account_code,
          account_name: l.account_name,
          subsidiary_code: l.subsidiary_code || null,
          subsidiary_name: l.subsidiary_name || null,
          detail1_code: l.detail1_code || null,
          detail1_name: l.detail1_name || null,
          detail2_code: l.detail2_code || null,
          detail2_name: l.detail2_name || null,
        })),
      },
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
    queryClient.invalidateQueries({ queryKey: ["journal-entry", entryId] });
    navigate({ to: "/documents/$entryId", params: { entryId } });
  }

  const field = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <SiteLayout>
      <PageHeader
        title={`ویرایش سطرهای سند ${entry.document_number}`}
        lead={`تاریخ: ${entry.entry_date_fa || formatDate(entry.entry_date)} — مبالغ بدهکار و بستانکار قابل ویرایش نیستند تا توازن سند حفظ شود؛ فقط حساب کل، معین و تفصیلی را تکمیل کنید.`}
      />

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-3">
          {(lines ?? []).map((line, i) => (
            <div key={line.id} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>سطر {i + 1}</span>
                <span>بدهکار: {formatAmount(line.debit)}</span>
                <span>بستانکار: {formatAmount(line.credit)}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  value={line.account_code}
                  onChange={(e) => update(i, { account_code: e.target.value })}
                  placeholder="کد حساب کل"
                  className={field}
                  required
                />
                <input
                  value={line.account_name}
                  onChange={(e) => update(i, { account_name: e.target.value })}
                  placeholder="نام حساب کل"
                  className={field}
                  required
                />
                <input
                  value={line.subsidiary_code}
                  onChange={(e) => update(i, { subsidiary_code: e.target.value })}
                  placeholder="کد معین"
                  className={field}
                />
                <input
                  value={line.subsidiary_name}
                  onChange={(e) => update(i, { subsidiary_name: e.target.value })}
                  placeholder="نام معین"
                  className={field}
                />
                <input
                  value={line.detail1_code}
                  onChange={(e) => update(i, { detail1_code: e.target.value })}
                  placeholder="کد تفصیلی ۱"
                  className={field}
                />
                <input
                  value={line.detail1_name}
                  onChange={(e) => update(i, { detail1_name: e.target.value })}
                  placeholder="نام تفصیلی ۱"
                  className={field}
                />
                <input
                  value={line.detail2_code}
                  onChange={(e) => update(i, { detail2_code: e.target.value })}
                  placeholder="کد تفصیلی ۲"
                  className={field}
                />
                <input
                  value={line.detail2_name}
                  onChange={(e) => update(i, { detail2_name: e.target.value })}
                  placeholder="نام تفصیلی ۲"
                  className={field}
                />
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "در حال ذخیره…" : "ذخیرهٔ تغییرات"}
          </button>
          <Link
            to="/documents/$entryId"
            params={{ entryId }}
            className="rounded-md border border-border px-5 py-2 text-sm hover:bg-muted"
          >
            انصراف
          </Link>
        </div>
      </form>
    </SiteLayout>
  );
}
