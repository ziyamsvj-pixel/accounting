-- F2 / 045 — بررسی پیش از Backfill (فقط خواندنی). خروجی را مسئول مالی بازبینی می‌کند.
-- هر ردیف با count > 0 باید پیش از اجرای 050 تعیین تکلیف شود.

select 'وضعیت ناشناخته' as check_name, count(*) as count
  from public.journal_entries where status not in ('draft', 'posted')
union all
select 'مبلغ اعشاری ریال (مقیاس ۰ لازم است)', count(*)
  from public.journal_lines where debit <> trunc(debit) or credit <> trunc(credit)
union all
select 'سطر بدون مبلغ یا با بدهکار و بستانکار هم‌زمان', count(*)
  from public.journal_lines where (debit = 0) = (credit = 0)
union all
select 'مبلغ منفی', count(*)
  from public.journal_lines where debit < 0 or credit < 0
union all
select 'سند ثبت‌قطعی نامتوازن', count(*)
  from (select e.id from public.journal_entries e join public.journal_lines l on l.entry_id = e.id
        where e.status = 'posted' group by e.id having sum(l.debit) <> sum(l.credit)) x
union all
select 'سند ثبت‌قطعی با کمتر از دو سطر', count(*)
  from (select e.id from public.journal_entries e left join public.journal_lines l on l.entry_id = e.id
        where e.status = 'posted' group by e.id having count(l.id) < 2) x
union all
select 'کد حساب با چند نام متفاوت', count(*)
  from (select account_code from public.journal_lines group by account_code
        having count(distinct account_name) > 1) x
union all
select 'کاربر دارای سند ولی بدون نقش', count(distinct e.user_id)
  from public.journal_entries e
  where not exists (select 1 from public.user_roles r where r.user_id = e.user_id);
