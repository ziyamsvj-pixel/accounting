-- F2 / 090 — مرحلهٔ Contract: فقط پس از انتقال کامل برنامه به RPC و ستون‌های جدید
-- و یک دورهٔ پایش بدون خطا (پیشنهاد: دست‌کم ۲ هفته). این مرحله Rollback ساده ندارد؛ پیش از آن Backup کامل.

-- ۱) حذف Policyهای قدیمی «فقط مالک سند» که مرز Company/Branch را دور می‌زنند
drop policy if exists "entries select own or admin" on public.journal_entries;
drop policy if exists "entries insert own editor" on public.journal_entries;
drop policy if exists "entries update own editor" on public.journal_entries;
drop policy if exists "entries delete own editor" on public.journal_entries;
drop policy if exists "lines select via entry" on public.journal_lines;
drop policy if exists "lines insert via entry" on public.journal_lines;
drop policy if exists "lines update via entry" on public.journal_lines;
drop policy if exists "lines delete via entry" on public.journal_lines;

-- ۲) ستون‌های سازمانی اجباری
alter table public.journal_entries
  alter column tenant_id set not null,
  alter column company_id set not null,
  alter column fiscal_period_id set not null,
  alter column created_by set not null;
alter table public.journal_lines
  alter column line_no set not null,
  alter column debit_minor set not null,
  alter column credit_minor set not null;

-- ۳) یکتایی شمارهٔ موقت در محدودهٔ Company به‌جای کاربر
alter table public.journal_entries drop constraint if exists journal_entries_user_id_document_number_key;
create unique index if not exists ux_journal_entries_draft_number
  on public.journal_entries (company_id, document_number);

-- ۴) (اختیاری، پس از تأیید) ستون‌های numeric قدیمی debit/credit در F2.1 حذف می‌شوند.
