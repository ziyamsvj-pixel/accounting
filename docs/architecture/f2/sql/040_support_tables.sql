-- F2 / 040 — جدول‌های پشتیبان Application: شماره‌گذاری، Idempotency، Audit، Outbox، یافته‌های ایجنت

-- شمارهٔ قطعی بی‌فاصله: قفل سطری روی (company, period) در همان تراکنش Post
create table public.document_sequences (
  company_id uuid not null references public.companies(id),
  fiscal_period_id uuid not null references public.fiscal_periods(id),
  last_value bigint not null default 0 check (last_value >= 0),
  primary key (company_id, fiscal_period_id)
);

create table public.idempotency_keys (
  company_id uuid not null references public.companies(id),
  user_id uuid not null,
  key text not null check (length(key) >= 8),
  command text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id, key)
);

-- Audit فقط افزودنی است؛ هیچ نقشی (حتی مالک) نمی‌تواند ویرایش یا حذف کند.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  company_id uuid not null references public.companies(id),
  actor_id uuid not null,
  action text not null,
  entry_id uuid references public.journal_entries(id),
  from_version integer,
  to_version integer,
  correlation_id uuid not null default gen_random_uuid(),
  details jsonb not null default '{}'::jsonb
);
create index audit_log_entry_idx on public.audit_log (entry_id, id);
create index audit_log_company_at_idx on public.audit_log (company_id, at);

create or replace function app_private.audit_log_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'سابقهٔ عملیات (audit_log) قابل ویرایش یا حذف نیست.' using errcode = '42501';
end $$;
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function app_private.audit_log_append_only();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function app_private.audit_log_append_only();

create table public.outbox_events (
  event_id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('journal.created', 'journal.submitted', 'journal.approved',
                                     'journal.posted', 'journal.reversed', 'journal.returned')),
  tenant_id uuid not null references public.tenants(id),
  company_id uuid not null references public.companies(id),
  entry_id uuid not null references public.journal_entries(id),
  entry_version integer not null,
  correlation_id uuid not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  status text not null default 'PENDING' check (status in ('PENDING', 'DONE', 'DEAD')),
  last_error text,
  available_at timestamptz not null default now()
);
create index outbox_events_pending_idx on public.outbox_events (available_at) where status = 'PENDING';

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  agent text not null,
  entry_id uuid references public.journal_entries(id),
  entry_version integer,
  correlation_id uuid,
  ruleset_version text not null,
  status text not null check (status in ('SUCCEEDED', 'FAILED', 'TIMED_OUT')),
  started_at timestamptz not null,
  finished_at timestamptz,
  error text
);

-- یافتهٔ ایجنت هرگز مسدودکننده نیست (اصل «هشدار هوشمند ≠ خطای قطعی Domain»)
create table public.agent_findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  branch_id uuid references public.branches(id),
  entry_id uuid references public.journal_entries(id),
  entry_version integer,
  run_id uuid references public.agent_runs(id),
  agent text not null,
  code text not null,
  severity text not null check (severity in ('INFO', 'WARNING', 'HIGH_RISK')),
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  title text not null,
  explanation text not null,
  evidence jsonb not null default '[]'::jsonb,
  suggested_actions jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  blocking boolean not null default false check (blocking = false),
  dedupe_key text not null,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED', 'ESCALATED')),
  ruleset_version text not null,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  status_changed_by uuid,
  status_changed_at timestamptz,
  unique (company_id, dedupe_key)       -- saveIfAbsent = insert ... on conflict do nothing
);
create index agent_findings_open_idx on public.agent_findings (company_id, status, created_at);

alter table public.document_sequences enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.audit_log enable row level security;
alter table public.outbox_events enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_findings enable row level security;
grant select on public.audit_log, public.agent_runs, public.agent_findings to authenticated;
grant update (status) on public.agent_findings to authenticated;
grant all on public.document_sequences, public.idempotency_keys, public.audit_log,
  public.outbox_events, public.agent_runs, public.agent_findings to service_role;
