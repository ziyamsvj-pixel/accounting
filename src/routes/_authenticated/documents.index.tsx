import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { SiteLayout, PageHeader } from "@/components/site-layout";
import {
  accessQuery,
  deleteEntry,
  entriesQuery,
  transitionEntry,
  type TransitionTarget,
} from "@/lib/accounting.functions";
import { formatAmount, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/documents/")({
  head: () => ({
    meta: [
      { title: "اسناد حسابداری — هستهٔ حسابداری" },
      {
        name: "description",
        content: "فهرست اسناد حسابداری شما با تاریخ، شماره سند، مبلغ و حساب‌های درگیر.",
      },
      { property: "og:title", content: "اسناد حسابداری — هستهٔ حسابداری" },
      { property: "og:description", content: "ثبت و مدیریت اسناد حسابداری دوطرفه." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentsPage,
});

const ROLE_FA: Record<string, string> = {
  viewer: "خواندن",
  editor: "ویرایش",
  admin: "مدیر",
};

const STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  submitted: "ارسال‌شده برای بررسی",
  returned: "برگشت‌خورده",
  approved: "تأییدشده",
  posted: "ثبت قطعی",
  locked: "قفل‌شده",
  reversed: "معکوس‌شده",
};

function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useQuery(accessQuery);
  const entries = useQuery(entriesQuery);
  const remove = useServerFn(deleteEntry);
  const changeStatus = useServerFn(transitionEntry);
  const [actionError, setActionError] = useState<string | null>(null);

  const canEdit = access.data?.canEdit ?? false;
  const isAdmin = access.data?.isAdmin ?? false;
  const userId = access.data?.userId;
  const rows = entries.data?.entries ?? [];

  async function onDelete(id: string) {
    setActionError(null);
    const res = await remove({ data: { id } });
    if (res.error) {
      setActionError(res.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
  }

  async function onTransition(id: string, version: number, target: TransitionTarget) {
    setActionError(null);
    const res = await changeStatus({ data: { id, version, target } });
    if (res.error) {
      setActionError(res.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
  }

  return (
    <SiteLayout>
      <PageHeader
        title="اسناد حسابداری"
        lead="هر سند دارای تاریخ، شماره، شرح و سطرهای بدهکار و بستانکار است. شما فقط اسناد مجاز را می‌بینید."
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          نقش شما:{" "}
          {(access.data?.roles ?? []).map((r) => ROLE_FA[r] ?? r).join("، ") || "در حال بارگذاری"}
        </p>
        <div className="flex gap-2">
          <Link
            to="/ledger"
            className="rounded-md border border-border px-3 py-2 text-xs hover:bg-muted"
          >
            دفتر کل
          </Link>
          {canEdit ? (
            <Link
              to="/documents/new"
              className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              ثبت سند جدید
            </Link>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {actionError}
        </p>
      ) : null}

      {entries.isLoading ? <p className="text-sm text-muted-foreground">در حال بارگذاری…</p> : null}

      <div className="space-y-3">
        {rows.map((entry) => {
          const amount = entry.journal_lines.reduce((s, l) => s + Number(l.debit || 0), 0);
          const accounts = Array.from(
            new Set(entry.journal_lines.map((l) => `${l.account_code} ${l.account_name}`)),
          );
          const isOwner = entry.user_id === userId;
          return (
            <div key={entry.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    شماره {entry.document_number}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.entry_date_fa || formatDate(entry.entry_date)}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                    {STATUS_FA[entry.status] ?? entry.status}
                  </span>
                </div>
                <span className="text-sm font-semibold">{formatAmount(amount)} ریال</span>
              </div>
              <p className="mt-2 text-sm">{entry.description || "بدون شرح"}</p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                حساب‌ها: {accounts.join(" · ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    navigate({ to: "/documents/$entryId", params: { entryId: entry.id } })
                  }
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  مشاهده و انطباق
                </button>
                {canEdit && isOwner && (entry.status === "draft" || entry.status === "returned") ? (
                  <button
                    onClick={() => onTransition(entry.id, entry.version, "submitted")}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                  >
                    ارسال برای بررسی
                  </button>
                ) : null}
                {canEdit && !isOwner && entry.status === "submitted" ? (
                  <button
                    onClick={() => onTransition(entry.id, entry.version, "approved")}
                    className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-500/10"
                  >
                    تأیید سند
                  </button>
                ) : null}
                {isAdmin && entry.status === "approved" ? (
                  <button
                    onClick={() => onTransition(entry.id, entry.version, "posted")}
                    className="rounded-md border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
                  >
                    ثبت قطعی
                  </button>
                ) : null}
                {isAdmin && entry.status === "posted" ? (
                  <button
                    onClick={() => onTransition(entry.id, entry.version, "locked")}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    قفل سند
                  </button>
                ) : null}
                {canEdit && isOwner && (entry.status === "draft" || entry.status === "returned") ? (
                  <button
                    onClick={() => onDelete(entry.id)}
                    className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                  >
                    حذف پیش‌نویس
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {!entries.isLoading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">هنوز سندی ثبت نشده است.</p>
        ) : null}
      </div>
    </SiteLayout>
  );
}
