-- F2 / 070 — Commandهای گردش‌کار به‌صورت RPC اتمیک (هر تابع = یک تراکنش)
-- خطاها: errcode P0001 و detail = کد خطای Domain (مثل CONCURRENCY_CONFLICT) تا Adapter
-- همان DomainValidationError لایهٔ TypeScript را بسازد.
-- همهٔ توابع SECURITY DEFINER با search_path خالی هستند و مجوز را خودشان صریحاً بررسی می‌کنند.

-- ---------- کمکی‌ها ----------
create or replace function app_private.fail(p_code text, p_message text) returns void
language plpgsql set search_path = ''
as $$ begin raise exception '%', p_message using errcode = 'P0001', detail = p_code; end $$;

create or replace function app_private.require_actor() returns uuid
language plpgsql stable set search_path = ''
as $$
declare v uuid := auth.uid();
begin
  if v is null then perform app_private.fail('PERMISSION_DENIED', 'کاربر احراز هویت نشده است.'); end if;
  return v;
end $$;

create or replace function app_private.require_role(
  p_company uuid, p_branch uuid, p_roles public.company_role[], p_action text
) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.can_access_branch(p_company, p_branch, p_roles) then
    perform app_private.fail('PERMISSION_DENIED', format('نقش کاربر اجازهٔ «%s» را نمی‌دهد.', p_action));
  end if;
end $$;

create or replace function app_private.lock_entry(p_entry uuid) returns public.journal_entries
language plpgsql security definer set search_path = ''
as $$
declare e public.journal_entries;
begin
  select * into e from public.journal_entries where id = p_entry for update;
  if not found then perform app_private.fail('NOT_FOUND', 'سند یافت نشد.'); end if;
  return e;
end $$;

create or replace function app_private.require_version(e public.journal_entries, p_expected int) returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if e.version <> p_expected then
    perform app_private.fail('CONCURRENCY_CONFLICT',
      format('سند توسط کاربر دیگری تغییر کرده است (نسخهٔ فعلی %s، نسخهٔ شما %s).', e.version, p_expected));
  end if;
end $$;

create or replace function app_private.write_audit(
  p_company uuid, p_action text, p_entry uuid, p_from int, p_to int, p_correlation uuid, p_details jsonb
) returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (company_id, actor_id, action, entry_id, from_version, to_version,
                                correlation_id, details)
  values (p_company, auth.uid(), p_action, p_entry, p_from, p_to, p_correlation, coalesce(p_details, '{}'))
$$;

create or replace function app_private.emit(
  p_type text, e public.journal_entries, p_correlation uuid, p_payload jsonb
) returns void
language sql security definer set search_path = ''
as $$
  insert into public.outbox_events (type, tenant_id, company_id, entry_id, entry_version,
                                    correlation_id, payload)
  values (p_type, e.tenant_id, e.company_id, e.id, e.version, p_correlation, coalesce(p_payload, '{}'))
$$;

-- Idempotency: همان کلید + همان درخواست → همان پاسخ؛ همان کلید + درخواست دیگر → خطا
create or replace function app_private.idem_lookup(
  p_company uuid, p_key text, p_command text, p_request jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r public.idempotency_keys;
begin
  if p_key is null or length(p_key) < 8 then
    perform app_private.fail('IDEMPOTENCY_KEY_REUSED', 'کلید idempotency معتبر (دست‌کم ۸ نویسه) لازم است.');
  end if;
  select * into r from public.idempotency_keys
   where company_id = p_company and user_id = auth.uid() and key = p_key;
  if not found then return null; end if;
  if r.command <> p_command or r.request_hash <> md5(p_request::text) then
    perform app_private.fail('IDEMPOTENCY_KEY_REUSED', 'این کلید قبلاً برای درخواست دیگری استفاده شده است.');
  end if;
  return r.response || jsonb_build_object('replayed', true);
end $$;

create or replace function app_private.idem_store(
  p_company uuid, p_key text, p_command text, p_request jsonb, p_response jsonb
) returns jsonb
language sql security definer set search_path = ''
as $$
  insert into public.idempotency_keys (company_id, user_id, key, command, request_hash, response)
  values (p_company, auth.uid(), p_key, p_command, md5(p_request::text), p_response);
  select p_response || jsonb_build_object('replayed', false);
$$;

create or replace function app_private.result(e public.journal_entries) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('entry_id', e.id, 'status', e.status, 'version', e.version,
                            'posted_number', e.posted_number)
$$;

-- توازن و اعتبار سطرها (برای Submit و Post)
create or replace function app_private.assert_postable_lines(e public.journal_entries) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int; v_dr bigint; v_cr bigint; r record;
  v_functional text;
begin
  select functional_currency into v_functional from public.companies where id = e.company_id;
  select count(*), coalesce(sum(debit_minor), 0), coalesce(sum(credit_minor), 0)
    into v_n, v_dr, v_cr from public.journal_lines where entry_id = e.id;
  if v_n < 2 then perform app_private.fail('TOO_FEW_LINES', 'سند باید دست‌کم دو سطر داشته باشد.'); end if;
  if v_dr <> v_cr or v_dr = 0 then
    perform app_private.fail('UNBALANCED', format('سند متوازن نیست (بدهکار %s، بستانکار %s).', v_dr, v_cr));
  end if;
  for r in
    select l.line_no, l.account_code, l.currency_code, l.rate_snapshot_id, l.foreign_amount_minor,
           a.id as acc_id, a.is_active, a.is_postable, coalesce(a.currency_code, v_functional) as acc_currency
    from public.journal_lines l
    left join public.accounts a on a.id = l.account_id
    where l.entry_id = e.id order by l.line_no
  loop
    if r.acc_id is null then
      perform app_private.fail('UNKNOWN_ACCOUNT', format('سطر %s: حساب %s در سرفصل نیست.', r.line_no, r.account_code));
    elsif not r.is_active or not r.is_postable then
      perform app_private.fail('INACTIVE_ACCOUNT', format('سطر %s: حساب %s غیرفعال یا غیرقابل ثبت است.', r.line_no, r.account_code));
    elsif r.acc_currency <> r.currency_code then
      perform app_private.fail('CURRENCY_MISMATCH',
        format('سطر %s: ارز سطر (%s) با ارز حساب %s (%s) یکسان نیست.', r.line_no, r.currency_code, r.account_code, r.acc_currency));
    elsif r.currency_code <> e.base_currency and (r.rate_snapshot_id is null or r.foreign_amount_minor is null) then
      perform app_private.fail('FOREIGN_LINE_MISSING_RATE', format('سطر %s: سطر ارزی بدون نرخ و مبلغ ارزی.', r.line_no));
    end if;
  end loop;
end $$;

-- ---------- Commandها ----------
create or replace function public.submit_entry(p_entry uuid, p_expected_version int, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare e public.journal_entries; v_req jsonb; v_prev jsonb; v_corr uuid := gen_random_uuid();
begin
  perform app_private.require_actor();
  e := app_private.lock_entry(p_entry);
  v_req := jsonb_build_object('entry', p_entry, 'version', p_expected_version);
  v_prev := app_private.idem_lookup(e.company_id, p_idempotency_key, 'submit', v_req);
  if v_prev is not null then return v_prev; end if;
  perform app_private.require_role(e.company_id, e.branch_id, array['editor', 'admin']::public.company_role[], 'SUBMIT');
  if e.created_by <> auth.uid() and not app_private.has_company_role(e.company_id, array['admin']::public.company_role[]) then
    perform app_private.fail('PERMISSION_DENIED', 'فقط ایجادکننده یا مدیر سیستم سند را ارسال می‌کند.');
  end if;
  if e.status <> 'draft' then perform app_private.fail('INVALID_TRANSITION', 'فقط سند پیش‌نویس ارسال می‌شود.'); end if;
  perform app_private.require_version(e, p_expected_version);
  perform app_private.assert_postable_lines(e);
  update public.journal_entries set status = 'submitted', submitted_by = auth.uid(), submitted_at = now(),
         version = version + 1 where id = e.id returning * into e;
  perform app_private.write_audit(e.company_id, 'SUBMIT', e.id, e.version - 1, e.version, v_corr, null);
  perform app_private.emit('journal.submitted', e, v_corr, null);
  return app_private.idem_store(e.company_id, p_idempotency_key, 'submit', v_req, app_private.result(e));
end $$;

create or replace function public.approve_entry(p_entry uuid, p_expected_version int, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare e public.journal_entries; v_req jsonb; v_prev jsonb; v_sod boolean; v_corr uuid := gen_random_uuid();
begin
  perform app_private.require_actor();
  e := app_private.lock_entry(p_entry);
  v_req := jsonb_build_object('entry', p_entry, 'version', p_expected_version);
  v_prev := app_private.idem_lookup(e.company_id, p_idempotency_key, 'approve', v_req);
  if v_prev is not null then return v_prev; end if;
  perform app_private.require_role(e.company_id, e.branch_id, array['approver', 'admin']::public.company_role[], 'APPROVE');
  select segregation_of_duties into v_sod from public.companies where id = e.company_id;
  if v_sod and e.created_by = auth.uid() then
    perform app_private.fail('SEGREGATION_OF_DUTIES', 'ایجادکنندهٔ سند نمی‌تواند همان سند را تأیید کند.');
  end if;
  if e.status <> 'submitted' then perform app_private.fail('INVALID_TRANSITION', 'فقط سند ارسال‌شده تأیید می‌شود.'); end if;
  perform app_private.require_version(e, p_expected_version);
  update public.journal_entries set status = 'approved', approved_by = auth.uid(), approved_at = now(),
         version = version + 1 where id = e.id returning * into e;
  perform app_private.write_audit(e.company_id, 'APPROVE', e.id, e.version - 1, e.version, v_corr, null);
  perform app_private.emit('journal.approved', e, v_corr, null);
  return app_private.idem_store(e.company_id, p_idempotency_key, 'approve', v_req, app_private.result(e));
end $$;

create or replace function public.return_to_draft(
  p_entry uuid, p_expected_version int, p_reason text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare e public.journal_entries; v_req jsonb; v_prev jsonb; v_corr uuid := gen_random_uuid();
begin
  perform app_private.require_actor();
  e := app_private.lock_entry(p_entry);
  v_req := jsonb_build_object('entry', p_entry, 'version', p_expected_version, 'reason', p_reason);
  v_prev := app_private.idem_lookup(e.company_id, p_idempotency_key, 'return', v_req);
  if v_prev is not null then return v_prev; end if;
  perform app_private.require_role(e.company_id, e.branch_id,
    array['approver', 'poster', 'admin']::public.company_role[], 'RETURN_TO_DRAFT');
  if e.status not in ('submitted', 'approved') then
    perform app_private.fail('INVALID_TRANSITION', 'فقط سند در جریان تأیید به پیش‌نویس برمی‌گردد.');
  end if;
  if coalesce(btrim(p_reason), '') = '' then perform app_private.fail('REASON_REQUIRED', 'دلیل برگشت لازم است.'); end if;
  perform app_private.require_version(e, p_expected_version);
  update public.journal_entries set status = 'draft', submitted_by = null, submitted_at = null,
         approved_by = null, approved_at = null, version = version + 1 where id = e.id returning * into e;
  perform app_private.write_audit(e.company_id, 'RETURN_TO_DRAFT', e.id, e.version - 1, e.version, v_corr,
    jsonb_build_object('reason', p_reason));
  perform app_private.emit('journal.returned', e, v_corr, jsonb_build_object('reason', p_reason));
  return app_private.idem_store(e.company_id, p_idempotency_key, 'return', v_req, app_private.result(e));
end $$;

create or replace function public.post_entry(
  p_entry uuid, p_expected_version int, p_idempotency_key text, p_content_hash text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.journal_entries; o public.journal_entries;
  v_req jsonb; v_prev jsonb; v_no bigint; v_mismatch int; v_corr uuid := gen_random_uuid();
begin
  perform app_private.require_actor();
  e := app_private.lock_entry(p_entry);
  v_req := jsonb_build_object('entry', p_entry, 'version', p_expected_version, 'hash', p_content_hash);
  v_prev := app_private.idem_lookup(e.company_id, p_idempotency_key, 'post', v_req);
  if v_prev is not null then return v_prev; end if;
  perform app_private.require_role(e.company_id, e.branch_id, array['poster', 'admin']::public.company_role[], 'POST');
  if e.status <> 'approved' then perform app_private.fail('INVALID_TRANSITION', 'فقط سند تأییدشده ثبت قطعی می‌شود.'); end if;
  perform app_private.require_version(e, p_expected_version);
  if app_private.period_status(e.fiscal_period_id) <> 'OPEN' then
    perform app_private.fail('PERIOD_CLOSED', 'دورهٔ مالی سند بسته است.');
  end if;
  perform app_private.assert_postable_lines(e);

  -- سند برگشتی: سند اصلی باید هنوز Posted و قرینهٔ دقیق باشد؛ در همین تراکنش REVERSED می‌شود.
  if e.reversal_of_id is not null then
    o := app_private.lock_entry(e.reversal_of_id);
    if o.status <> 'posted' or o.reversed_by_id is not null then
      perform app_private.fail('ALREADY_REVERSED', 'این سند قبلاً برگشت خورده است.');
    end if;
    select count(*) into v_mismatch from (
      select line_no, account_code, subsidiary_code, detail1_code, detail2_code, currency_code,
             foreign_amount_minor, rate_snapshot_id, party_id, cost_center_id,
             credit_minor as a, debit_minor as b
        from public.journal_lines where entry_id = o.id
      except all
      select line_no, account_code, subsidiary_code, detail1_code, detail2_code, currency_code,
             foreign_amount_minor, rate_snapshot_id, party_id, cost_center_id,
             debit_minor, credit_minor
        from public.journal_lines where entry_id = e.id
    ) d;
    if v_mismatch > 0 or (select count(*) from public.journal_lines where entry_id = o.id)
                       <> (select count(*) from public.journal_lines where entry_id = e.id) then
      perform app_private.fail('REVERSAL_MISMATCH', 'سند برگشتی قرینهٔ دقیق سند اصلی نیست.');
    end if;
  end if;

  -- شمارهٔ قطعی بی‌فاصله: قفل سطری sequence تا پایان تراکنش
  insert into public.document_sequences as s (company_id, fiscal_period_id, last_value)
  values (e.company_id, e.fiscal_period_id, 1)
  on conflict (company_id, fiscal_period_id) do update set last_value = s.last_value + 1
  returning last_value into v_no;

  update public.journal_entries set status = 'posted', posted_number = v_no::text, posted_at = now(),
         posted_by = auth.uid(), content_hash = p_content_hash, version = version + 1
   where id = e.id returning * into e;
  perform app_private.write_audit(e.company_id, 'POST', e.id, e.version - 1, e.version, v_corr,
    jsonb_build_object('posted_number', e.posted_number));
  perform app_private.emit('journal.posted', e, v_corr, jsonb_build_object('posted_number', e.posted_number));

  if o.id is not null then
    update public.journal_entries set status = 'reversed', reversed_by_id = e.id, version = version + 1
     where id = o.id returning * into o;
    perform app_private.write_audit(o.company_id, 'REVERSE', o.id, o.version - 1, o.version, v_corr,
      jsonb_build_object('reversal_id', e.id, 'reversal_number', e.posted_number));
    perform app_private.emit('journal.reversed', o, v_corr, jsonb_build_object('reversal_id', e.id));
  end if;
  return app_private.idem_store(e.company_id, p_idempotency_key, 'post', v_req, app_private.result(e));
end $$;

create or replace function public.create_reversal(
  p_original uuid, p_entry_date date, p_reason text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare o public.journal_entries; r public.journal_entries; v_req jsonb; v_prev jsonb;
        v_corr uuid := gen_random_uuid();
begin
  perform app_private.require_actor();
  o := app_private.lock_entry(p_original);
  v_req := jsonb_build_object('original', p_original, 'date', p_entry_date, 'reason', p_reason);
  v_prev := app_private.idem_lookup(o.company_id, p_idempotency_key, 'reverse', v_req);
  if v_prev is not null then return v_prev; end if;
  perform app_private.require_role(o.company_id, o.branch_id, array['poster', 'admin']::public.company_role[], 'REVERSE');
  if o.status <> 'posted' then perform app_private.fail('INVALID_TRANSITION', 'فقط سند Posted قابل برگشت است.'); end if;
  if exists (select 1 from public.journal_entries where reversal_of_id = o.id) then
    perform app_private.fail('REVERSAL_IN_PROGRESS', 'برای این سند، سند برگشتی در جریان است.');
  end if;
  if coalesce(btrim(p_reason), '') = '' then perform app_private.fail('REASON_REQUIRED', 'دلیل برگشت لازم است.'); end if;

  insert into public.journal_entries (user_id, created_by, company_id, branch_id, entry_date, document_number,
         description, status, document_type, reversal_of_id, base_currency, idempotency_key, source_reference)
  values (auth.uid(), auth.uid(), o.company_id, o.branch_id, p_entry_date,
          'REV-' || coalesce(o.posted_number, o.document_number) || '-' || left(o.id::text, 8),
          format('برگشت سند %s: %s', coalesce(o.posted_number, o.document_number), p_reason),
          'draft', 'REVERSAL', o.id, o.base_currency, p_idempotency_key, o.id::text)
  returning * into r;

  insert into public.journal_lines (entry_id, line_no, account_code, account_name, debit, credit,
         debit_minor, credit_minor, description, subsidiary_code, subsidiary_name, detail1_code,
         detail1_name, detail2_code, detail2_name, currency_code, foreign_amount_minor,
         rate_snapshot_id, party_id, cost_center_id)
  select r.id, l.line_no, l.account_code, l.account_name, l.credit, l.debit,
         l.credit_minor, l.debit_minor, l.description, l.subsidiary_code, l.subsidiary_name,
         l.detail1_code, l.detail1_name, l.detail2_code, l.detail2_name, l.currency_code,
         l.foreign_amount_minor, l.rate_snapshot_id, l.party_id, l.cost_center_id
  from public.journal_lines l where l.entry_id = o.id;

  perform app_private.write_audit(r.company_id, 'CREATE_REVERSAL', r.id, 0, r.version, v_corr,
    jsonb_build_object('reversal_of', o.id, 'reason', p_reason));
  perform app_private.emit('journal.created', r, v_corr, jsonb_build_object('reversal_of', o.id));
  return app_private.idem_store(r.company_id, p_idempotency_key, 'reverse', v_req, app_private.result(r));
end $$;

-- تکمیل اتمیک معین/تفصیلی خالی در سند Posted (همهٔ سطرها یا هیچ‌کدام)
-- p_lines: [{"id": "...", "subsidiary_code": "...", ...}]
create or replace function public.enrich_posted_lines(p_entry uuid, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.journal_entries; item jsonb; l public.journal_lines; k text; v_raw text; v_new text; v_old text;
  v_count int := 0; v_changes jsonb := '[]'::jsonb; v_corr uuid := gen_random_uuid();
  c_keys constant text[] := array['subsidiary_code', 'subsidiary_name', 'detail1_code',
                                  'detail1_name', 'detail2_code', 'detail2_name'];
begin
  perform app_private.require_actor();
  e := app_private.lock_entry(p_entry);
  perform app_private.require_role(e.company_id, e.branch_id, array['editor', 'admin']::public.company_role[], 'ENRICH');
  if e.status <> 'posted' then perform app_private.fail('INVALID_TRANSITION', 'فقط سند ثبت‌قطعی تکمیل می‌شود.'); end if;
  if jsonb_typeof(p_lines) <> 'array' or
     (select count(*) from jsonb_array_elements(p_lines)) <>
     (select count(distinct x ->> 'id') from jsonb_array_elements(p_lines) x) then
    perform app_private.fail('INVALID_INPUT', 'فهرست سطرها نامعتبر است یا سطر تکراری دارد.');
  end if;
  for item in select * from jsonb_array_elements(p_lines) loop
    select * into l from public.journal_lines where id = (item ->> 'id')::uuid and entry_id = e.id;
    if not found then perform app_private.fail('NOT_FOUND', 'سطر موردنظر در این سند یافت نشد.'); end if;
    foreach k in array c_keys loop
      continue when not item ? k;
      v_raw := item ->> k;
      v_new := nullif(btrim(coalesce(v_raw, '')), '');
      v_old := to_jsonb(l) ->> k;
      if v_old is not null and v_old <> '' then
        if v_raw is distinct from v_old and v_new is distinct from v_old then
          perform app_private.fail('POSTED_IMMUTABLE',
            'در سند ثبت‌قطعی‌شده فقط تکمیل معین/تفصیلی خالی مجاز است، نه تغییر مقدار موجود.');
        end if;
      elsif v_new is not null then
        execute format('update public.journal_lines set %I = $1 where id = $2', k) using v_new, l.id;
        v_count := v_count + 1;
        v_changes := v_changes || jsonb_build_object('line_id', l.id, 'field', k, 'value', v_new);
      end if;
    end loop;
  end loop;
  if v_count > 0 then
    perform app_private.write_audit(e.company_id, 'ENRICH_POSTED', e.id, e.version, e.version, v_corr,
      jsonb_build_object('changes', v_changes));
  end if;
  return jsonb_build_object('entry_id', e.id, 'filled', v_count);
end $$;

-- ذخیرهٔ اتمیک سطرهای پیش‌نویس با قفل خوش‌بینانه (جایگزین به‌روزرسانی سطربه‌سطر فعلی)
create or replace function public.save_draft_lines(p_entry uuid, p_expected_version int, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare e public.journal_entries; v_corr uuid := gen_random_uuid();
begin
  perform app_private.require_actor();
  e := app_private.lock_entry(p_entry);
  perform app_private.require_role(e.company_id, e.branch_id, array['editor', 'admin']::public.company_role[], 'EDIT');
  if e.created_by <> auth.uid() and not app_private.has_company_role(e.company_id, array['admin']::public.company_role[]) then
    perform app_private.fail('PERMISSION_DENIED', 'فقط ایجادکننده یا مدیر سیستم پیش‌نویس را ویرایش می‌کند.');
  end if;
  if e.status <> 'draft' then perform app_private.fail('INVALID_TRANSITION', 'فقط سند پیش‌نویس ویرایش می‌شود.'); end if;
  if e.document_type = 'REVERSAL' then
    perform app_private.fail('REVERSAL_MISMATCH', 'سطرهای سند برگشتی قابل ویرایش نیستند.');
  end if;
  perform app_private.require_version(e, p_expected_version);
  delete from public.journal_lines where entry_id = e.id;
  insert into public.journal_lines (entry_id, line_no, account_code, account_name, debit_minor, credit_minor,
         debit, credit, description, subsidiary_code, subsidiary_name, detail1_code, detail1_name,
         detail2_code, detail2_name, currency_code, foreign_amount_minor, rate_snapshot_id)
  select e.id, x.ord, x.v ->> 'account_code', x.v ->> 'account_name',
         (x.v ->> 'debit_minor')::bigint, (x.v ->> 'credit_minor')::bigint,
         (x.v ->> 'debit_minor')::numeric, (x.v ->> 'credit_minor')::numeric,
         x.v ->> 'description',
         nullif(btrim(x.v ->> 'subsidiary_code'), ''), nullif(btrim(x.v ->> 'subsidiary_name'), ''),
         nullif(btrim(x.v ->> 'detail1_code'), ''), nullif(btrim(x.v ->> 'detail1_name'), ''),
         nullif(btrim(x.v ->> 'detail2_code'), ''), nullif(btrim(x.v ->> 'detail2_name'), ''),
         coalesce(x.v ->> 'currency_code', e.base_currency),
         (x.v ->> 'foreign_amount_minor')::bigint, (x.v ->> 'rate_snapshot_id')::uuid
  from jsonb_array_elements(p_lines) with ordinality as x(v, ord);
  update public.journal_entries set version = version + 1 where id = e.id returning * into e;
  perform app_private.write_audit(e.company_id, 'UPDATE_DRAFT', e.id, e.version - 1, e.version, v_corr,
    jsonb_build_object('lines', jsonb_array_length(p_lines)));
  return app_private.result(e);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.submit_entry(uuid, int, text)', 'public.approve_entry(uuid, int, text)',
    'public.return_to_draft(uuid, int, text, text)', 'public.post_entry(uuid, int, text, text)',
    'public.create_reversal(uuid, date, text, text)', 'public.enrich_posted_lines(uuid, jsonb)',
    'public.save_draft_lines(uuid, int, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- توابع کمکی app_private که Policy به آن‌ها نیاز ندارد، برای کاربر قابل اجرا نیستند
  foreach f in array array[
    'app_private.fail(text, text)', 'app_private.require_actor()',
    'app_private.require_role(uuid, uuid, public.company_role[], text)', 'app_private.lock_entry(uuid)',
    'app_private.require_version(public.journal_entries, int)',
    'app_private.write_audit(uuid, text, uuid, int, int, uuid, jsonb)',
    'app_private.emit(text, public.journal_entries, uuid, jsonb)',
    'app_private.idem_lookup(uuid, text, text, jsonb)', 'app_private.idem_store(uuid, text, text, jsonb, jsonb)',
    'app_private.result(public.journal_entries)', 'app_private.assert_postable_lines(public.journal_entries)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
