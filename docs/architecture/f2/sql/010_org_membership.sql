-- F2 / 010 — مرز سازمانی: Tenant → Company → Branch و عضویت نقش‌دار
-- وابسته به تصمیم D-007 بند ۱ (Company/Branch مرز سازمانی) و بند ۵ (نقش‌ها).

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;  -- برای اجرای توابع کمکی RLS؛ این schema در API منتشر نمی‌شود

create type public.company_role as enum ('viewer', 'editor', 'approver', 'poster', 'admin');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  -- ارز عملکردی دفتر؛ تومان فقط نمایشی است و هرگز ارز دفتر نمی‌شود (D-007 بند ۳)
  functional_currency text not null default 'IRR' check (functional_currency <> 'IRT'),
  toman_policy_version text not null default 'IRT-1',
  -- تفکیک وظایف: ایجادکننده نمی‌تواند سند خود را تأیید کند (D-007 بند ۵)
  segregation_of_duties boolean not null default true,
  created_at timestamptz not null default now()
);
create index companies_tenant_idx on public.companies (tenant_id);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

-- branch_id = null یعنی دسترسی به همهٔ شعب همان Company
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null,
  branch_id uuid references public.branches(id),
  role public.company_role not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique nulls not distinct (company_id, user_id, role, branch_id)
);
create index company_members_user_idx on public.company_members (user_id, company_id);

-- ---------------------------------------------------------------------------
-- توابع کمکی RLS: SECURITY DEFINER با search_path خالی (رفع هشدار search_path)،
-- تا Policyها بدون بازگشت بی‌پایان RLS عضویت را بخوانند.
-- ---------------------------------------------------------------------------
create or replace function app_private.has_company_role(
  p_company uuid,
  p_roles public.company_role[] default null
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company
      and m.user_id = (select auth.uid())
      and (p_roles is null or m.role = any (p_roles))
  )
$$;

-- دسترسی به شعبه: عضو سراسری Company یا عضو همان شعبه. سند بدون شعبه برای همهٔ اعضا.
create or replace function app_private.can_access_branch(
  p_company uuid,
  p_branch uuid,
  p_roles public.company_role[] default null
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company
      and m.user_id = (select auth.uid())
      and (p_roles is null or m.role = any (p_roles))
      and (m.branch_id is null or p_branch is null or m.branch_id = p_branch)
  )
$$;

revoke all on function app_private.has_company_role(uuid, public.company_role[]) from public, anon;
revoke all on function app_private.can_access_branch(uuid, uuid, public.company_role[]) from public, anon;
grant execute on function app_private.has_company_role(uuid, public.company_role[]) to authenticated;
grant execute on function app_private.can_access_branch(uuid, uuid, public.company_role[]) to authenticated;

alter table public.tenants enable row level security;
alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.company_members enable row level security;
grant select on public.tenants, public.companies, public.branches, public.company_members to authenticated;
grant insert, update on public.branches to authenticated;
grant insert, delete on public.company_members to authenticated;
grant all on public.tenants, public.companies, public.branches, public.company_members to service_role;
