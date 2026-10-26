-- F2 / 060 — قیدهای پایگاه‌داده که اصول Domain را حتی بدون برنامه تضمین می‌کنند:
--   سند Posted تغییرناپذیر است؛ فقط تکمیل معین/تفصیلی خالی مجاز است؛ حذف سند غیر Draft ممنوع است؛
--   سند فقط متوازن Post می‌شود؛ تغییر وضعیت فقط از مسیر RPC گردش‌کار.
-- «کاربر مستقیم» = current_user در (authenticated, anon). توابع RPC با SECURITY DEFINER اجرا می‌شوند
-- و current_user آن‌ها مالک تابع است؛ بنابراین توابع Trigger عمداً SECURITY INVOKER هستند.

-- ---------- توابع کمکی (DEFINER، فقط خواندن/قفل، بدون منطق تصمیم) ----------
create or replace function app_private.entry_guard_info(p_entry uuid)
returns table (status text, document_type text, company_id uuid)
language sql volatile security definer set search_path = ''
as $$
  -- FOR SHARE: تا پایان تراکنش، Post/تغییر وضعیت هم‌زمان همین سند منتظر می‌ماند (رفع Race).
  select e.status, e.document_type, e.company_id from public.journal_entries e
  where e.id = p_entry for share
$$;

create or replace function app_private.default_company_for_user() returns uuid
language sql stable security definer set search_path = ''
as $$
  select case when count(distinct m.company_id) = 1 then min(m.company_id::text)::uuid end
  from public.company_members m where m.user_id = (select auth.uid())
$$;

create or replace function app_private.single_branch_for_user(p_company uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select case when bool_or(m.branch_id is null) then null
              when count(distinct m.branch_id) = 1 then min(m.branch_id::text)::uuid end
  from public.company_members m
  where m.user_id = (select auth.uid()) and m.company_id = p_company
$$;

create or replace function app_private.company_tenant(p_company uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select c.tenant_id from public.companies c where c.id = p_company $$;

create or replace function app_private.period_status(p_period uuid) returns text
language sql stable security definer set search_path = ''
as $$ select p.status from public.fiscal_periods p where p.id = p_period $$;

create or replace function app_private.account_id_for(p_company uuid, p_code text) returns uuid
language sql stable security definer set search_path = ''
as $$ select a.id from public.accounts a where a.company_id = p_company and a.code = p_code $$;

-- هر تغییر سطر پیش‌نویس، نسخهٔ سرسند را بالا می‌برد تا قفل خوش‌بینانهٔ Submit/Post تغییر هم‌زمان را ببیند.
create or replace function app_private.bump_entry_version(p_entry uuid) returns void
language sql volatile security definer set search_path = ''
as $$ update public.journal_entries set version = version + 1 where id = p_entry and status = 'draft' $$;

create or replace function app_private.is_direct_client() returns boolean
language sql stable set search_path = ''
as $$ select current_user in ('authenticated', 'anon') $$;

do $$
declare f text;
begin
  foreach f in array array[
    'app_private.entry_guard_info(uuid)', 'app_private.default_company_for_user()',
    'app_private.single_branch_for_user(uuid)', 'app_private.company_tenant(uuid)',
    'app_private.period_status(uuid)', 'app_private.account_id_for(uuid, text)',
    'app_private.is_direct_client()', 'app_private.period_for(uuid, date)',
    'app_private.bump_entry_version(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------- سرسند ----------
create or replace function app_private.journal_entries_before_insert() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if app_private.is_direct_client() then
    -- ثبت مستقیم سند قطعی از برنامه ممنوع است (D-007 بند ۵؛ تغییر رفتار صفحهٔ «سند جدید»)
    if new.status is distinct from 'draft' then
      raise exception 'سند جدید فقط به‌صورت پیش‌نویس ساخته می‌شود؛ ثبت قطعی از مسیر تأیید انجام می‌شود.'
        using errcode = '42501';
    end if;
    new.user_id := auth.uid();
    new.created_by := auth.uid();
    new.version := 1;
    new.submitted_by := null; new.submitted_at := null;
    new.approved_by := null;  new.approved_at := null;
    new.posted_by := null;    new.posted_at := null; new.posted_number := null;
    new.content_hash := null; new.reversal_of_id := null; new.reversed_by_id := null;
    new.legacy_imported := false;
    if new.document_type = 'REVERSAL' then
      raise exception 'سند برگشتی فقط از مسیر create_reversal ساخته می‌شود.' using errcode = '42501';
    end if;
    if new.company_id is null then
      new.company_id := app_private.default_company_for_user();
      if new.company_id is null then
        raise exception 'شرکت سند مشخص نیست (کاربر عضو هیچ یا چند شرکت است).' using errcode = '23502';
      end if;
    end if;
    if new.branch_id is null then
      new.branch_id := app_private.single_branch_for_user(new.company_id);
    end if;
  end if;
  new.tenant_id := app_private.company_tenant(new.company_id);
  if new.tenant_id is null then
    raise exception 'شرکت % وجود ندارد.', new.company_id using errcode = '23503';
  end if;
  if new.fiscal_period_id is null then
    new.fiscal_period_id := app_private.period_for(new.company_id, new.entry_date);
  end if;
  if new.fiscal_period_id is null then
    raise exception 'برای تاریخ % دورهٔ مالی تعریف نشده است.', new.entry_date using errcode = '23514';
  end if;
  if new.status = 'draft' and app_private.period_status(new.fiscal_period_id) <> 'OPEN' then
    raise exception 'دورهٔ مالی تاریخ % بسته است.', new.entry_date using errcode = '23514';
  end if;
  return new;
end $$;
create trigger journal_entries_before_insert
  before insert on public.journal_entries
  for each row execute function app_private.journal_entries_before_insert();

create or replace function app_private.journal_entries_before_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  c_mutable_on_reverse constant text[] := array['status', 'reversed_by_id', 'version', 'updated_at'];
begin
  -- اصل «سند Posted قابل ویرایش مستقیم نیست» برای همهٔ نقش‌ها، حتی RPC:
  -- تنها تغییر مجاز سند Posted، برگشت‌خوردن آن با پیوند به سند برگشتی است.
  if old.status in ('posted', 'reversed') then
    if not (old.status = 'posted' and new.status = 'reversed' and new.reversed_by_id is not null
            and (to_jsonb(new) - c_mutable_on_reverse) = (to_jsonb(old) - c_mutable_on_reverse)) then
      raise exception 'سند ثبت‌قطعی‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی ثبت کنید.'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if app_private.is_direct_client() then
    if old.status <> 'draft' then
      raise exception 'سند در جریان تأیید فقط از مسیر گردش‌کار تغییر می‌کند.' using errcode = '42501';
    end if;
    if old.document_type = 'REVERSAL' and new.document_type <> 'REVERSAL' then
      raise exception 'نوع سند برگشتی قابل تغییر نیست.' using errcode = '42501';
    end if;
    new.version := old.version + 1;
  end if;
  if new.entry_date is distinct from old.entry_date and new.status = 'draft' then
    new.fiscal_period_id := app_private.period_for(new.company_id, new.entry_date);
    if new.fiscal_period_id is null or app_private.period_status(new.fiscal_period_id) <> 'OPEN' then
      raise exception 'دورهٔ مالی تاریخ % تعریف نشده یا بسته است.', new.entry_date using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger journal_entries_before_update
  before update on public.journal_entries
  for each row execute function app_private.journal_entries_before_update();

create or replace function app_private.journal_entries_before_delete() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'فقط سند پیش‌نویس قابل حذف است؛ سند ثبت‌قطعی با سند برگشتی اصلاح می‌شود.'
      using errcode = '42501';
  end if;
  return old;
end $$;
create trigger journal_entries_before_delete
  before delete on public.journal_entries
  for each row execute function app_private.journal_entries_before_delete();

-- توازن و حداقل دو سطر هنگام Post؛ تأخیری تا پایان تراکنش (شبکهٔ ایمنی کنار post_entry)
create or replace function app_private.journal_entries_check_balance() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_n int; v_dr bigint; v_cr bigint; v_noacc int;
begin
  select count(*), coalesce(sum(debit_minor), 0), coalesce(sum(credit_minor), 0),
         count(*) filter (where account_id is null)
    into v_n, v_dr, v_cr, v_noacc
  from public.journal_lines where entry_id = new.id;
  if v_n < 2 or v_dr <> v_cr or v_dr = 0 or v_noacc > 0 then
    raise exception 'سند % متوازن نیست یا سطر/حساب نامعتبر دارد (سطر=%، بدهکار=%، بستانکار=%).',
      new.id, v_n, v_dr, v_cr using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger journal_entries_check_balance
  after update of status on public.journal_entries
  deferrable initially deferred
  for each row when (new.status = 'posted' and old.status is distinct from 'posted')
  execute function app_private.journal_entries_check_balance();

-- ---------- سطرها ----------
create or replace function app_private.journal_lines_guard() returns trigger
language plpgsql set search_path = ''
as $$
declare
  g record;
  c_enrich constant text[] := array['subsidiary_code', 'subsidiary_name', 'detail1_code',
                                    'detail1_name', 'detail2_code', 'detail2_name'];
  k text;
  v_old text;
  v_new text;
  v_entry uuid := coalesce(new.entry_id, old.entry_id);
begin
  select * into g from app_private.entry_guard_info(v_entry);
  if tg_op = 'UPDATE' and new.entry_id is distinct from old.entry_id then
    raise exception 'سطر به سند دیگری منتقل نمی‌شود.' using errcode = '42501';
  end if;

  if g.status is not null and g.status <> 'draft' then
    if tg_op <> 'UPDATE' then
      raise exception 'سطر سند ثبت‌شده یا در جریان تأیید قابل افزودن/حذف نیست.' using errcode = '42501';
    end if;
    if g.status not in ('posted', 'reversed') then
      raise exception 'سطر سند در جریان تأیید قابل تغییر نیست؛ ابتدا آن را به پیش‌نویس برگردانید.'
        using errcode = '42501';
    end if;
    -- فقط تکمیل معین/تفصیلی خالی؛ مقایسهٔ دقیق (بدون trim)
    if (to_jsonb(new) - c_enrich) <> (to_jsonb(old) - c_enrich) then
      raise exception 'در سند ثبت‌قطعی‌شده فقط تکمیل معین/تفصیلی خالی مجاز است.' using errcode = '42501';
    end if;
    foreach k in array c_enrich loop
      v_old := to_jsonb(old) ->> k;
      v_new := to_jsonb(new) ->> k;
      if v_old is not null and v_old <> '' and v_new is distinct from v_old then
        raise exception 'مقدار موجود % در سند ثبت‌قطعی‌شده قابل تغییر نیست.', k using errcode = '42501';
      end if;
      if (v_old is null or v_old = '') and v_new is not null and btrim(v_new) <> v_new then
        raise exception 'مقدار % باید بدون فاصلهٔ ابتدا/انتها باشد.', k using errcode = '22000';
      end if;
    end loop;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if app_private.is_direct_client() and g.document_type = 'REVERSAL' then
      raise exception 'سطرهای سند برگشتی قابل حذف نیست؛ کل سند پیش‌نویس را حذف کنید.' using errcode = '42501';
    end if;
    if app_private.is_direct_client() and g.status is not null then
      perform app_private.bump_entry_version(v_entry);
    end if;
    return old;
  end if;

  if app_private.is_direct_client() and g.document_type = 'REVERSAL' then
    raise exception 'سطرهای سند برگشتی از سند اصلی ساخته می‌شوند و قابل ویرایش نیستند.'
      using errcode = '42501';
  end if;

  -- همگام‌سازی مبلغ قدیمی (numeric) و دقیق (bigint): ریال اعشار ندارد.
  if tg_op = 'INSERT' or new.debit is distinct from old.debit or new.credit is distinct from old.credit then
    if new.debit <> trunc(new.debit) or new.credit <> trunc(new.credit) then
      raise exception 'مبلغ ریالی نباید اعشار داشته باشد.' using errcode = '22000';
    end if;
    if tg_op = 'INSERT' and new.debit_minor is not null then
      new.debit := new.debit_minor; new.credit := new.credit_minor;
    else
      new.debit_minor := new.debit::bigint; new.credit_minor := new.credit::bigint;
    end if;
  elsif new.debit_minor is distinct from old.debit_minor or new.credit_minor is distinct from old.credit_minor then
    new.debit := new.debit_minor; new.credit := new.credit_minor;
  end if;
  new.account_id := app_private.account_id_for(g.company_id, new.account_code);
  if app_private.is_direct_client() then
    perform app_private.bump_entry_version(v_entry);
  end if;
  if new.line_no is null then
    select coalesce(max(l.line_no), 0) + 1 into new.line_no
    from public.journal_lines l where l.entry_id = new.entry_id;
  end if;
  return new;
end $$;
create trigger journal_lines_guard
  before insert or update or delete on public.journal_lines
  for each row execute function app_private.journal_lines_guard();

-- ---------- دسترسی ستونی: وضعیت، نسخه و فیلدهای گردش‌کار فقط از RPC ----------
revoke insert, update on public.journal_entries from authenticated;
grant insert (user_id, entry_date, entry_date_fa, document_number, description, status,
              company_id, branch_id, document_type, idempotency_key)
  on public.journal_entries to authenticated;
grant update (entry_date, entry_date_fa, document_number, description, branch_id, document_type)
  on public.journal_entries to authenticated;

revoke update on public.journal_lines from authenticated;
grant update (account_code, account_name, debit, credit, description,
              subsidiary_code, subsidiary_name, detail1_code, detail1_name, detail2_code, detail2_name,
              currency_code, foreign_amount_minor, rate_snapshot_id, party_id, cost_center_id)
  on public.journal_lines to authenticated;
