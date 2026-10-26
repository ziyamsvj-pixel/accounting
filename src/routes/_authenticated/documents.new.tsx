import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { SiteLayout, PageHeader } from "@/components/site-layout";
import { createEntry, generateEntryDraft, type LineInput } from "@/lib/accounting.functions";
import { formatAmount } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/documents/new")({
  head: () => ({
    meta: [
      { title: "ثبت سند حسابداری — هستهٔ حسابداری" },
      {
        name: "description",
        content: "ورود سند حسابداری واقعی با تاریخ، شماره، حساب‌ها و مبالغ بدهکار و بستانکار.",
      },
      { property: "og:title", content: "ثبت سند حسابداری — هستهٔ حسابداری" },
      { property: "og:description", content: "ثبت سند دوطرفه و متوازن." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewDocumentPage,
});

type Row = LineInput;

const emptyRow = (): Row => ({
  account_code: "",
  account_name: "",
  debit: 0,
  credit: 0,
  description: "",
});

function NewDocumentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submit = useServerFn(createEntry);
  const generateDraft = useServerFn(generateEntryDraft);

  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiUsed, setAiUsed] = useState(false);

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryDateFa, setEntryDateFa] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
  const balanced = Math.round((totalDebit - totalCredit) * 100) === 0 && totalDebit > 0;

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function onGenerateDraft() {
    setAiBusy(true);
    setAiError(null);
    const res = await generateDraft({ data: { description: aiText } });
    setAiBusy(false);
    if (res.error || !res.draft) {
      setAiError(res.error ?? "تولید پیشنهاد ممکن نشد.");
      return;
    }
    setDescription(res.draft.description);
    setRows(
      res.draft.lines.map((l) => ({
        account_code: l.account_code,
        account_name: l.account_name,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? "",
        subsidiary_code: l.subsidiary_code ?? "",
        subsidiary_name: l.subsidiary_name ?? "",
        detail1_code: l.detail1_code ?? "",
        detail1_name: l.detail1_name ?? "",
        detail2_code: l.detail2_code ?? "",
        detail2_name: l.detail2_name ?? "",
      })),
    );
    setAiUsed(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await submit({
      data: {
        entry_date: entryDate,
        entry_date_fa: entryDateFa || null,
        document_number: documentNumber,
        description,
        status,
        lines: rows.filter((r) => r.account_code || r.account_name),
      },
    });
    setBusy(false);
    if (res.error || !res.id) {
      setError(res.error ?? "ثبت سند ممکن نشد.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
    navigate({ to: "/documents/$entryId", params: { entryId: res.id } });
  }

  const field = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <SiteLayout>
      <PageHeader
        title="ثبت سند حسابداری"
        lead="سند باید متوازن باشد: جمع بدهکار برابر جمع بستانکار. پس از ثبت، نتیجهٔ انطباق با قواعد ذخیره‌شده نمایش داده می‌شود."
      />

      <div className="mb-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">تولید سند با هوش مصنوعی</h2>
        <p className="mb-3 text-xs leading-6 text-muted-foreground">
          شرح آزاد رویداد مالی را بنویسید؛ هوش مصنوعی بر اساس حساب‌های کل، معین و تفصیلی که قبلاً
          استفاده کرده‌اید، یک سند متوازن پیشنهاد می‌کند و فرم زیر را پر می‌کند. پیشنهاد را پیش از
          ثبت بررسی و اصلاح کنید.
        </p>
        <textarea
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          rows={3}
          placeholder="مثلاً: امروز مبلغ ۵۰ میلیون ریال بابت فروش کالا از مشتری آقای رضایی دریافت شد و به حساب بانک ملی واریز گردید."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onGenerateDraft}
            disabled={aiBusy || aiText.trim().length < 10}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {aiBusy ? "در حال تولید پیشنهاد…" : "تولید پیشنهاد با هوش مصنوعی"}
          </button>
          {aiUsed ? (
            <span className="text-xs text-emerald-600">
              پیشنهاد در فرم زیر قرار گرفت؛ لطفاً پیش از ثبت بررسی کنید.
            </span>
          ) : null}
        </div>
        {aiError ? (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {aiError}
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">تاریخ سند (میلادی)</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className={field}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">تاریخ شمسی (اختیاری)</label>
            <input
              value={entryDateFa}
              onChange={(e) => setEntryDateFa(e.target.value)}
              placeholder="۱۴۰۵/۰۶/۲۱"
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">شماره سند</label>
            <input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              className={field}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">وضعیت</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
              <option value="draft">پیش‌نویس</option>
              <option value="posted">ثبت قطعی</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">شرح سند</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">سطرهای سند</h2>
            <button
              type="button"
              onClick={() => setRows((p) => [...p, emptyRow()])}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              افزودن سطر
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-5">
                <input
                  value={row.account_code}
                  onChange={(e) => update(i, { account_code: e.target.value })}
                  placeholder="کد حساب کل"
                  className={field}
                />
                <input
                  value={row.account_name}
                  onChange={(e) => update(i, { account_name: e.target.value })}
                  placeholder="نام حساب کل"
                  className={field}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.debit || ""}
                  onChange={(e) => update(i, { debit: Number(e.target.value) })}
                  placeholder="بدهکار"
                  className={field}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.credit || ""}
                  onChange={(e) => update(i, { credit: Number(e.target.value) })}
                  placeholder="بستانکار"
                  className={field}
                />
                <input
                  value={row.description ?? ""}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder="شرح سطر"
                  className={field}
                />
                {(
                  [
                    ["subsidiary_code", "کد معین"],
                    ["subsidiary_name", "نام معین"],
                    ["detail1_code", "کد تفصیلی ۱"],
                    ["detail1_name", "نام تفصیلی ۱"],
                    ["detail2_code", "کد تفصیلی ۲"],
                    ["detail2_name", "نام تفصیلی ۲"],
                  ] as const
                ).map(([k, ph]) => (
                  <input
                    key={k}
                    value={row[k] ?? ""}
                    onChange={(e) => update(i, { [k]: e.target.value })}
                    placeholder={ph}
                    className={field}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>جمع بدهکار: {formatAmount(totalDebit)}</span>
            <span>جمع بستانکار: {formatAmount(totalCredit)}</span>
            <span className={balanced ? "text-emerald-600" : "text-destructive"}>
              {balanced ? "سند متوازن است" : "سند متوازن نیست"}
            </span>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "در حال ثبت…" : "ثبت سند و بررسی انطباق"}
        </button>
      </form>
    </SiteLayout>
  );
}
