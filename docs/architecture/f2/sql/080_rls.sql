-- F2 / 080 — RLS سازمانی (Tenant/Company/Branch + نقش). Policyهای قدیمی «فقط مالک سند»
-- تا مرحلهٔ Contract (فایل 090) می‌مانند؛ Policyهای PERMISSIVE با OR ترکیب می‌شوند، پس در این
-- مرحله هیچ کاربری دسترسی فعلی خود را از دست نمی‌دهد. قیدهای 060 در هر دو حالت اعمال می‌شوند.

-- ---------- ساختار سازمانی ----------
create policy "tenants: member read" on public.tenants for select to authenticated
  using (exists (select 1 from public.companies c
                 where c.tenant_id = tenants.id and app_private.has_company_role(c.id)));
create policy "companies: member read" on public.companies for select to authenticated
  using (app_private.has_company_role(id));
create policy "branches: member read" on public.branches for select to authenticated
  using (app_private.can_access_branch(company_id, id));
create policy "branches: admin write" on public.branches for insert to authenticated
  with check (app_private.has_company_role(company_id, array['admin']::public.company_role[]));
create policy "branches: admin update" on public.branches for update to authenticated
  using (app_private.has_company_role(company_id, array['admin']::public.company_role[]))
  with check (app_private.has_company_role(company_id, array['admin']::public.company_role[]));
create policy "members: own or admin read" on public.company_members for select to authenticated
  using (user_id = (select auth.uid())
         or app_private.has_company_role(company_id, array['admin']::public.company_role[]));
create policy "members: admin insert" on public.company_members for insert to authenticated
  with check (app_private.has_company_role(company_id, array['admin']::public.company_role[]));
create policy "members: admin delete" on public.company_members for delete to authenticated
  using (app_private.has_company_role(company_id, array['admin']::public.company_role[])
         and user_id <> (select auth.uid()));   -- مدیر نقش خودش را حذف نمی‌کند (جلوگیری از قفل‌شدن)

create policy "accounts: member read" on public.accounts for select to authenticated
  using (app_private.has_company_role(company_id));
create policy "accounts: admin insert" on public.accounts for insert to authenticated
  with check (app_private.has_company_role(company_id, array['admin']::public.company_role[]));
create policy "accounts: admin update" on public.accounts for update to authenticated
  using (app_private.has_company_role(company_id, array['admin']::public.company_role[]))
  with check (app_private.has_company_role(company_id, array['admin']::public.company_role[]));
create policy "periods: member read" on public.fiscal_periods for select to authenticated
  using (app_private.has_company_role(company_id));
create policy "periods: admin insert" on public.fiscal_periods for insert to authenticated
  with check (app_private.has_company_role(company_id, array['admin']::public.company_role[]));
create policy "periods: admin update" on public.fiscal_periods for update to authenticated
  using (app_private.has_company_role(company_id, array['admin']::public.company_role[]))
  with check (app_private.has_company_role(company_id, array['admin']::public.company_role[]));

-- ---------- اسناد ----------
-- دیدن: اعضای شعبه همهٔ اسناد غیر پیش‌نویس را می‌بینند؛ پیش‌نویس فقط برای ایجادکننده و مدیر.
create or replace function app_private.can_read_entry(
  p_company uuid, p_branch uuid, p_status text, p_created_by uuid
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app_private.can_access_branch(p_company, p_branch)
     and (p_status <> 'draft' or p_created_by = (select auth.uid())
          or app_private.has_company_role(p_company, array['admin']::public.company_role[]))
$$;

-- ویرایش/حذف پیش‌نویس: ایجادکنندهٔ دارای نقش editor، یا admin
create or replace function app_private.can_edit_draft(
  p_company uuid, p_branch uuid, p_status text, p_created_by uuid
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_status = 'draft'
     and (app_private.can_access_branch(p_company, p_branch, array['admin']::public.company_role[])
          or (p_created_by = (select auth.uid())
              and app_private.can_access_branch(p_company, p_branch, array['editor']::public.company_role[])))
$$;

create or replace function app_private.can_touch_lines(p_entry uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.journal_entries e where e.id = p_entry and (
      app_private.can_edit_draft(e.company_id, e.branch_id, e.status, e.created_by)
      -- تکمیل معین/تفصیلی سند Posted (Trigger 060 فقط پرکردن فیلد خالی را می‌پذیرد)
      or (e.status = 'posted'
          and app_private.can_access_branch(e.company_id, e.branch_id, array['editor', 'admin']::public.company_role[]))))
$$;

create or replace function app_private.can_read_lines(p_entry uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.journal_entries e where e.id = p_entry
                 and app_private.can_read_entry(e.company_id, e.branch_id, e.status, e.created_by))
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'app_private.can_read_entry(uuid, uuid, text, uuid)', 'app_private.can_edit_draft(uuid, uuid, text, uuid)',
    'app_private.can_touch_lines(uuid)', 'app_private.can_read_lines(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

create policy "entries: org read" on public.journal_entries for select to authenticated
  using (company_id is not null and app_private.can_read_entry(company_id, branch_id, status, created_by));
create policy "entries: org insert draft" on public.journal_entries for insert to authenticated
  with check (status = 'draft' and created_by = (select auth.uid())
              and app_private.can_access_branch(company_id, branch_id, array['editor', 'admin']::public.company_role[]));
create policy "entries: org update draft" on public.journal_entries for update to authenticated
  using (app_private.can_edit_draft(company_id, branch_id, status, created_by))
  with check (app_private.can_edit_draft(company_id, branch_id, status, created_by));
create policy "entries: org delete draft" on public.journal_entries for delete to authenticated
  using (app_private.can_edit_draft(company_id, branch_id, status, created_by));

create policy "lines: org read" on public.journal_lines for select to authenticated
  using (app_private.can_read_lines(entry_id));
create policy "lines: org insert" on public.journal_lines for insert to authenticated
  with check (app_private.can_touch_lines(entry_id));
create policy "lines: org update" on public.journal_lines for update to authenticated
  using (app_private.can_touch_lines(entry_id)) with check (app_private.can_touch_lines(entry_id));
create policy "lines: org delete" on public.journal_lines for delete to authenticated
  using (app_private.can_touch_lines(entry_id));

-- ---------- Audit و ایجنت ----------
create policy "audit: reviewers read" on public.audit_log for select to authenticated
  using (app_private.has_company_role(company_id,
           array['approver', 'poster', 'admin']::public.company_role[]));
create policy "agent_runs: member read" on public.agent_runs for select to authenticated
  using (app_private.has_company_role(company_id));
create policy "findings: member read" on public.agent_findings for select to authenticated
  using (app_private.can_access_branch(company_id, branch_id));
create policy "findings: reviewer status" on public.agent_findings for update to authenticated
  using (app_private.can_access_branch(company_id, branch_id, array['approver', 'admin']::public.company_role[]))
  with check (app_private.can_access_branch(company_id, branch_id, array['approver', 'admin']::public.company_role[]));
-- document_sequences، idempotency_keys و outbox_events هیچ Policy برای authenticated ندارند (فقط RPC و service_role).
