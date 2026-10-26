-- F2 / Rollback مرحلهٔ Expand (010 تا 080). دادهٔ ستون‌های قدیمی دست‌نخورده است، پس برنامهٔ فعلی
-- پس از اجرای این فایل مثل قبل کار می‌کند. اسنادی که پس از F2 از مسیر گردش‌کار ثبت شده‌اند
-- وضعیت submitted/approved/reversed دارند؛ پیش از Rollback باید تعیین تکلیف شوند (پایین).
-- پس از 090 این فایل کافی نیست و بازگشت از Backup لازم است.

do $$
begin
  if exists (select 1 from public.journal_entries where status not in ('draft', 'posted')) then
    raise exception 'Rollback متوقف شد: اسناد با وضعیت جدید (submitted/approved/reversed) وجود دارند.';
  end if;
end $$;

-- 080
drop policy if exists "tenants: member read" on public.tenants;
drop policy if exists "companies: member read" on public.companies;
drop policy if exists "branches: member read" on public.branches;
drop policy if exists "branches: admin write" on public.branches;
drop policy if exists "branches: admin update" on public.branches;
drop policy if exists "members: own or admin read" on public.company_members;
drop policy if exists "members: admin insert" on public.company_members;
drop policy if exists "members: admin delete" on public.company_members;
drop policy if exists "accounts: member read" on public.accounts;
drop policy if exists "accounts: admin insert" on public.accounts;
drop policy if exists "accounts: admin update" on public.accounts;
drop policy if exists "periods: member read" on public.fiscal_periods;
drop policy if exists "periods: admin insert" on public.fiscal_periods;
drop policy if exists "periods: admin update" on public.fiscal_periods;
drop policy if exists "entries: org read" on public.journal_entries;
drop policy if exists "entries: org insert draft" on public.journal_entries;
drop policy if exists "entries: org update draft" on public.journal_entries;
drop policy if exists "entries: org delete draft" on public.journal_entries;
drop policy if exists "lines: org read" on public.journal_lines;
drop policy if exists "lines: org insert" on public.journal_lines;
drop policy if exists "lines: org update" on public.journal_lines;
drop policy if exists "lines: org delete" on public.journal_lines;
drop policy if exists "audit: reviewers read" on public.audit_log;
drop policy if exists "agent_runs: member read" on public.agent_runs;
drop policy if exists "findings: member read" on public.agent_findings;
drop policy if exists "findings: reviewer status" on public.agent_findings;

-- 070
drop function if exists public.submit_entry(uuid, int, text);
drop function if exists public.approve_entry(uuid, int, text);
drop function if exists public.return_to_draft(uuid, int, text, text);
drop function if exists public.post_entry(uuid, int, text, text);
drop function if exists public.create_reversal(uuid, date, text, text);
drop function if exists public.enrich_posted_lines(uuid, jsonb);
drop function if exists public.save_draft_lines(uuid, int, jsonb);

-- 060
drop trigger if exists journal_entries_before_insert on public.journal_entries;
drop trigger if exists journal_entries_before_update on public.journal_entries;
drop trigger if exists journal_entries_before_delete on public.journal_entries;
drop trigger if exists journal_entries_check_balance on public.journal_entries;
drop trigger if exists journal_lines_guard on public.journal_lines;
grant insert, update on public.journal_entries to authenticated;
grant update on public.journal_lines to authenticated;

-- 040
drop table if exists public.agent_findings, public.agent_runs, public.outbox_events,
  public.audit_log, public.idempotency_keys, public.document_sequences;

-- 030
alter table public.journal_lines
  drop constraint if exists journal_lines_amounts_chk,
  drop constraint if exists journal_lines_currency_chk,
  drop constraint if exists journal_lines_foreign_chk,
  drop column if exists line_no, drop column if exists account_id, drop column if exists currency_code,
  drop column if exists debit_minor, drop column if exists credit_minor,
  drop column if exists foreign_amount_minor, drop column if exists rate_snapshot_id,
  drop column if exists party_id, drop column if exists cost_center_id;
alter table public.journal_entries
  drop constraint if exists journal_entries_status_chk,
  drop constraint if exists journal_entries_doc_type_chk,
  drop constraint if exists journal_entries_base_currency_chk,
  drop constraint if exists journal_entries_posted_fields_chk,
  drop constraint if exists journal_entries_reversed_link_chk,
  drop column if exists tenant_id, drop column if exists company_id, drop column if exists branch_id,
  drop column if exists fiscal_period_id, drop column if exists document_type,
  drop column if exists posted_number, drop column if exists version, drop column if exists base_currency,
  drop column if exists created_by, drop column if exists submitted_by, drop column if exists submitted_at,
  drop column if exists approved_by, drop column if exists approved_at, drop column if exists posted_by,
  drop column if exists posted_at, drop column if exists content_hash, drop column if exists idempotency_key,
  drop column if exists reversal_of_id, drop column if exists reversed_by_id,
  drop column if exists source_reference, drop column if exists legacy_imported;

-- 020 و 010
drop table if exists public.fiscal_periods, public.accounts;
drop table if exists public.company_members, public.branches, public.companies, public.tenants;
drop schema if exists app_private cascade;
drop type if exists public.company_role;
