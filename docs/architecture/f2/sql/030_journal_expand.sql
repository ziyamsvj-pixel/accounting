-- F2 / 030 — گسترش جدول‌های سند (Expand). ستون‌های قدیمی دست نمی‌خورند تا برنامهٔ فعلی کار کند.
-- قیدهای جدید NOT VALID افزوده می‌شوند و پس از Backfill (فایل 050) اعتبارسنجی می‌شوند.

alter table public.journal_entries
  add column tenant_id uuid references public.tenants(id),
  add column company_id uuid references public.companies(id),
  add column branch_id uuid references public.branches(id),
  add column fiscal_period_id uuid references public.fiscal_periods(id),
  add column document_type text not null default 'GENERAL',
  add column posted_number text,          -- شمارهٔ قطعی بی‌فاصله؛ document_number فعلی شمارهٔ موقت/مرجع می‌ماند
  add column version integer not null default 1,
  add column base_currency text not null default 'IRR',
  add column created_by uuid,
  add column submitted_by uuid,
  add column submitted_at timestamptz,
  add column approved_by uuid,
  add column approved_at timestamptz,
  add column posted_by uuid,
  add column posted_at timestamptz,
  add column content_hash text,
  add column idempotency_key text,
  add column reversal_of_id uuid references public.journal_entries(id),
  add column reversed_by_id uuid references public.journal_entries(id),
  add column source_reference text,
  add column legacy_imported boolean not null default false;

alter table public.journal_entries
  add constraint journal_entries_status_chk
    check (status in ('draft', 'submitted', 'approved', 'posted', 'reversed')) not valid,
  add constraint journal_entries_doc_type_chk
    check (document_type in ('GENERAL', 'EXPENSE', 'PURCHASE_INVOICE', 'SALES_INVOICE',
                              'PAYMENT', 'RECEIPT', 'REVERSAL', 'FX_REVALUATION')) not valid,
  add constraint journal_entries_base_currency_chk check (base_currency <> 'IRT') not valid;
-- قیدهای posted_fields و reversed_link در پایان 050 افزوده می‌شوند، چون اسناد Posted قدیمی
-- تا آن لحظه شمارهٔ قطعی ندارند (قید NOT VALID هم روی UPDATE ردیف‌ها اعمال می‌شود).

-- شمارهٔ قطعی در Company و دوره یکتاست؛ هر سند حداکثر یک سند برگشتی دارد؛
-- کلید Idempotency در محدودهٔ Company + کاربر.
create unique index ux_journal_entries_posted_number
  on public.journal_entries (company_id, fiscal_period_id, posted_number)
  where posted_number is not null;
create unique index ux_journal_entries_reversal_of
  on public.journal_entries (reversal_of_id) where reversal_of_id is not null;
create unique index ux_journal_entries_idempotency
  on public.journal_entries (company_id, created_by, idempotency_key)
  where idempotency_key is not null;
create index journal_entries_company_period_idx
  on public.journal_entries (company_id, fiscal_period_id, status);
create index journal_entries_company_date_idx on public.journal_entries (company_id, entry_date);

alter table public.journal_lines
  add column line_no integer,
  add column account_id uuid references public.accounts(id),
  add column currency_code text not null default 'IRR',
  -- مبلغ دقیق ارز پایه در واحد خرد (ریال: مقیاس ۰). debit/credit قدیمی تا مرحلهٔ Contract همگام می‌مانند.
  add column debit_minor bigint,
  add column credit_minor bigint,
  add column foreign_amount_minor bigint,
  add column rate_snapshot_id uuid,       -- FK به document_rate_snapshots در F3
  add column party_id uuid,
  add column cost_center_id uuid;

alter table public.journal_lines
  add constraint journal_lines_amounts_chk
    check (debit_minor >= 0 and credit_minor >= 0
           and (debit_minor = 0) <> (credit_minor = 0)) not valid,
  add constraint journal_lines_currency_chk check (currency_code <> 'IRT') not valid,
  add constraint journal_lines_foreign_chk
    check (foreign_amount_minor is null or foreign_amount_minor > 0) not valid;

create unique index ux_journal_lines_entry_line_no
  on public.journal_lines (entry_id, line_no) where line_no is not null;
create index journal_lines_account_idx on public.journal_lines (account_id);
