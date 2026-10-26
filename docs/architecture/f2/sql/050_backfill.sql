-- F2 / 050 — انتقال دادهٔ موجود به ساختار سازمانی (یک تراکنش؛ در صورت هر خطا هیچ تغییری نمی‌ماند).
-- پیش‌فرض این فایل گزینهٔ «یک Company مشترک برای همهٔ کاربران فعلی» است (D-007 بند ۱).
-- نام‌ها را پیش از اجرا با تصمیم مالک جایگزین کنید.

do $$
declare
  c_tenant_name  constant text := 'سازمان اصلی';
  c_company_name constant text := 'شرکت اصلی';
  c_branch_code  constant text := 'HQ';
  c_branch_name  constant text := 'دفتر مرکزی';
  v_tenant uuid;
  v_company uuid;
  v_branch uuid;
  v_bad bigint;
  v_from date;
  v_to date;
begin
  -- ۱) شرط‌های توقف (همان بررسی‌های 045)
  select count(*) into v_bad from public.journal_entries where status not in ('draft', 'posted');
  if v_bad > 0 then raise exception 'Backfill متوقف شد: % سند با وضعیت ناشناخته.', v_bad; end if;
  select count(*) into v_bad from public.journal_lines
   where debit <> trunc(debit) or credit <> trunc(credit) or debit < 0 or credit < 0
      or (debit = 0) = (credit = 0);
  if v_bad > 0 then raise exception 'Backfill متوقف شد: % سطر با مبلغ نامعتبر (اعشار، منفی، صفر یا دوطرفه).', v_bad; end if;

  -- ۲) ساختار سازمانی
  insert into public.tenants (name) values (c_tenant_name) returning id into v_tenant;
  insert into public.companies (tenant_id, name) values (v_tenant, c_company_name) returning id into v_company;
  insert into public.branches (company_id, code, name) values (v_company, c_branch_code, c_branch_name)
    returning id into v_branch;

  -- ۳) عضویت: نقش‌های فعلی حفظ می‌شوند؛ صاحب سندِ بدون نقش، editor می‌شود.
  insert into public.company_members (company_id, user_id, role)
  select distinct v_company, r.user_id, r.role::text::public.company_role from public.user_roles r
  on conflict do nothing;
  insert into public.company_members (company_id, user_id, role)
  select distinct v_company, e.user_id, 'editor'::public.company_role from public.journal_entries e
  where not exists (select 1 from public.user_roles r where r.user_id = e.user_id)
  on conflict do nothing;

  -- ۴) دوره‌های ماهانهٔ شمسی از قدیمی‌ترین سند تا پایان سال جاری
  select least(coalesce(min(entry_date), current_date), current_date), current_date + 366
    into v_from, v_to from public.journal_entries;
  insert into public.fiscal_periods (company_id, code, start_date, end_date)
  select v_company, app_private.jalali_period_code(d::date), min(d)::date, max(d)::date
  from generate_series(v_from - 31, v_to, interval '1 day') d
  group by app_private.jalali_period_code(d::date)
  -- ماه‌های ناقص ابتدا و انتهای بازه کنار گذاشته نمی‌شوند؛ فقط ماه کامل لازم است:
  having min(d)::date > v_from - 31 and max(d)::date < v_to;

  -- ۵) سرفصل حساب از کدهای استفاده‌شده؛ نوع حساب را مسئول مالی تعیین می‌کند (needs_review).
  insert into public.accounts (company_id, code, name, needs_review)
  select v_company, l.account_code, mode() within group (order by l.account_name), true
  from public.journal_lines l group by l.account_code;

  -- ۶) سرسند
  update public.journal_entries e set
    tenant_id = v_tenant,
    company_id = v_company,
    branch_id = v_branch,
    created_by = e.user_id,
    fiscal_period_id = app_private.period_for(v_company, e.entry_date),
    legacy_imported = true;
  select count(*) into v_bad from public.journal_entries where fiscal_period_id is null;
  if v_bad > 0 then raise exception 'Backfill متوقف شد: % سند بدون دورهٔ مالی.', v_bad; end if;

  -- ۷) سطرها: شمارهٔ سطر، حساب، مبلغ دقیق ریالی
  update public.journal_lines l set
    line_no = x.rn,
    account_id = a.id,
    debit_minor = l.debit::bigint,
    credit_minor = l.credit::bigint,
    currency_code = 'IRR'
  from (select id, row_number() over (partition by entry_id order by created_at, id) as rn
        from public.journal_lines) x,
       public.accounts a
  where x.id = l.id and a.company_id = v_company and a.code = l.account_code;

  -- ۸) شمارهٔ قطعی برای اسناد ثبت‌قطعی قدیمی: به ترتیب تاریخ، در هر دوره از ۱
  update public.journal_entries e set
    posted_number = x.n::text,
    posted_at = e.updated_at,
    posted_by = e.user_id
  from (select id, row_number() over (partition by fiscal_period_id order by entry_date, created_at, id) as n
        from public.journal_entries where status = 'posted') x
  where x.id = e.id;
  insert into public.document_sequences (company_id, fiscal_period_id, last_value)
  select v_company, fiscal_period_id, max(posted_number::bigint)
  from public.journal_entries where posted_number is not null group by fiscal_period_id;

  -- ۹) سابقهٔ عملیات برای انتقال
  insert into public.audit_log (company_id, actor_id, action, entry_id, from_version, to_version, details)
  select v_company, e.user_id, 'LEGACY_IMPORT', e.id, null, e.version,
         jsonb_build_object('legacy_status', e.status, 'posted_number', e.posted_number)
  from public.journal_entries e;
end $$;

-- ۱۰) اعتبارسنجی قیدها روی دادهٔ منتقل‌شده (اگر داده‌ای ناسازگار باشد، همین‌جا خطا می‌دهد)
alter table public.journal_entries validate constraint journal_entries_status_chk;
alter table public.journal_entries validate constraint journal_entries_doc_type_chk;
alter table public.journal_entries validate constraint journal_entries_base_currency_chk;
alter table public.journal_entries
  add constraint journal_entries_posted_fields_chk
    check (status not in ('posted', 'reversed') or (posted_number is not null and posted_at is not null)),
  add constraint journal_entries_reversed_link_chk
    check ((status = 'reversed') = (reversed_by_id is not null));
alter table public.journal_lines validate constraint journal_lines_amounts_chk;
alter table public.journal_lines validate constraint journal_lines_currency_chk;
alter table public.journal_lines validate constraint journal_lines_foreign_chk;
