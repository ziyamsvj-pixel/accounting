-- F2 / 020 — سرفصل حساب‌ها و دوره‌های مالی (Company-scoped)

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  name text not null,
  -- برای حساب‌های واردشده از دادهٔ قدیمی null است تا مسئول مالی طبقه‌بندی کند (needs_review)
  account_type text check (account_type in ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  level text not null default 'GENERAL' check (level in ('GENERAL', 'SUBSIDIARY', 'DETAIL')),
  parent_id uuid references public.accounts(id),
  -- null = فقط ارز عملکردی Company؛ مقدار = حساب ارزی که فقط همان ارز را می‌پذیرد
  currency_code text check (currency_code is null or currency_code <> 'IRT'),
  is_monetary boolean not null default false,
  is_postable boolean not null default true,
  is_active boolean not null default true,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,                     -- مثل 1405-08 (سال-ماه شمسی)
  start_date date not null,
  end_date date not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED', 'LOCKED')),
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz not null default now(),
  unique (company_id, code),
  check (start_date <= end_date)
);
create index fiscal_periods_lookup_idx on public.fiscal_periods (company_id, start_date, end_date);

-- دوره‌های یک Company نباید هم‌پوشانی داشته باشند (بدون نیاز به افزونهٔ btree_gist)
create or replace function app_private.fiscal_periods_no_overlap() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from public.fiscal_periods p
    where p.company_id = new.company_id and p.id <> new.id
      and p.start_date <= new.end_date and new.start_date <= p.end_date
  ) then
    raise exception 'دورهٔ مالی % با دورهٔ دیگری هم‌پوشانی دارد.', new.code
      using errcode = '23P01';
  end if;
  return new;
end $$;
create trigger fiscal_periods_no_overlap
  before insert or update of start_date, end_date, company_id on public.fiscal_periods
  for each row execute function app_private.fiscal_periods_no_overlap();

-- تاریخ میلادی → سال/ماه/روز شمسی (الگوریتم حسابی ۳۳ساله؛ با تقویم ICU fa-IR تست شده است).
-- فقط برای Backfill و پیش‌فرض دوره؛ تقویم رسمی دوره‌ها را مسئول مالی تأیید می‌کند.
create or replace function app_private.to_jalali(p date)
returns table (jy int, jm int, jd int)
language plpgsql immutable set search_path = ''
as $$
declare
  gy int := extract(year from p)::int;
  gm int := extract(month from p)::int;
  gd int := extract(day from p)::int;
  g_d_m int[] := array[0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  gy2 int;
  days int;
begin
  gy2 := case when gm > 2 then gy + 1 else gy end;
  days := 355666 + 365 * gy + (gy2 + 3) / 4 - (gy2 + 99) / 100 + (gy2 + 399) / 400 + gd + g_d_m[gm];
  jy := -1595 + 33 * (days / 12053);
  days := days % 12053;
  jy := jy + 4 * (days / 1461);
  days := days % 1461;
  if days > 365 then
    jy := jy + (days - 1) / 365;
    days := (days - 1) % 365;
  end if;
  if days < 186 then
    jm := 1 + days / 31;
    jd := 1 + days % 31;
  else
    jm := 7 + (days - 186) / 30;
    jd := 1 + (days - 186) % 30;
  end if;
  return next;
end $$;

create or replace function app_private.jalali_period_code(p date) returns text
language sql immutable set search_path = ''
as $$
  select j.jy::text || '-' || lpad(j.jm::text, 2, '0') from app_private.to_jalali(p) j
$$;

-- دورهٔ مالی بازِ یک تاریخ؛ سند بدون دورهٔ معتبر ساخته نمی‌شود.
create or replace function app_private.period_for(p_company uuid, p_date date) returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.fiscal_periods p
  where p.company_id = p_company and p_date between p.start_date and p.end_date
$$;

alter table public.accounts enable row level security;
alter table public.fiscal_periods enable row level security;
grant select, insert, update on public.accounts, public.fiscal_periods to authenticated;
grant all on public.accounts, public.fiscal_periods to service_role;
