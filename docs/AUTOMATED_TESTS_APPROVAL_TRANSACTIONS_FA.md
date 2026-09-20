# راهنمای تست خودکار چرخهٔ تأیید و تراکنش‌های حسابداری

## هدف تست‌ها

تست این پروژه باید فقط رفتار صفحهٔ وب را بررسی نکند. کنترل اصلی در PostgreSQL، RLS و functionهای انتقال وضعیت قرار دارد؛ بنابراین تست‌های اصلی باید در یک Supabase محلی یا database آزمایشی اجرا شوند. تست‌های UI و TypeScript مکمل این تست‌ها هستند، نه جایگزین آن‌ها.

## لایه‌های پیشنهادی تست

### ۱. تست migration و schema

در CI یک database خالی بسازید و همهٔ migrationها را از ابتدا اجرا کنید. سپس موارد زیر را بررسی کنید:

- جدول‌های `audit_events`، `account_nodes`، `ledger_dimensions` و `journal_line_dimensions` وجود دارند.
- Foreign Keyهای مالکیت و خطوط سند فعال‌اند.
- status فقط مقدارهای مجاز را می‌پذیرد.
- debit و credit منفی یا هم‌زمان مثبت پذیرفته نمی‌شوند.
- درخت حساب فقط مسیر `group → general → subsidiary → detail` را می‌پذیرد.
- policyهای RLS برای نقش‌های anonymous، viewer، editor و admin فعال‌اند.

این مرحله باید با `supabase db reset` در محیط محلی و در صورت امکان با `supabase db diff` برای بررسی drift اجرا شود. [1] [2]

### ۲. تست pgTAP برای commandهای دیتابیس

Supabase امکان فعال‌سازی pgTAP را برای تست assertionهای SQL فراهم می‌کند. فایل تست باید با fixtureهای مستقل اجرا شود و در پایان rollback شود. نمونهٔ مفهومی:

```sql
begin;

select plan(8);

-- Fixture باید از قبل کاربر test-editor و test-admin را در محیط test بسازد.
-- مقداردهی claim در محیط تست باید با روش مورد استفادهٔ پروژه انجام شود.

select has_table('public', 'audit_events', 'audit table exists');
select has_table('public', 'account_nodes', 'chart of accounts exists');
select has_function('public', 'submit_journal_entry', 'submit command exists');
select has_function('public', 'approve_journal_entry', 'approve command exists');
select has_function('public', 'post_journal_entry', 'post command exists');
select has_function('public', 'transition_journal_entry', 'transition function exists');

-- بعد از ساخت یک draft با fixture معتبر:
-- select lives_ok($$select public.submit_journal_entry(:entry_id, 1)$$,
--   'editor can submit own draft');
-- select throws_ok($$select public.post_journal_entry(:entry_id, 2)$$,
--   '22023', 'invalid post transition', 'editor cannot post directly');

select * from finish();
rollback;
```

در تست واقعی، به جای placeholderها باید fixture کاربر، نقش، account tree، header و دو line تراز ایجاد شود. برای تست RLS باید session با role `authenticated` و claim کاربر مربوطه ساخته شود؛ هرگز تست را با service-role اجرا نکنید، چون service-role RLS را دور می‌زند.

### ۳. تست transition و separation of duties

برای هر transition حداقل این ماتریس را اجرا کنید:

| وضعیت فعلی | وضعیت مقصد                | actor مجاز                      | نتیجهٔ مورد انتظار        |
| ---------- | ------------------------- | ------------------------------- | ------------------------- |
| draft      | submitted                 | مالک editor                     | موفق                      |
| submitted  | approved                  | کاربر دیگری با permission تأیید | موفق                      |
| submitted  | approved                  | مالک سند                        | رد با خطای مجوز یا policy |
| approved   | posted                    | admin یا permission مشخص        | موفق                      |
| draft      | posted                    | هر actor                        | رد                        |
| posted     | draft                     | هر actor                        | رد                        |
| posted     | reversed                  | admin با علت                    | موفق                      |
| هر وضعیت   | هر وضعیت با version قدیمی | actor مجاز                      | رد با stale version       |

هر تست باید مقدار status، actor، version و رکورد audit را هم بررسی کند. موفقیت صرفاً بر اساس status کافی نیست.

### ۴. تست atomicity و rollback

برای اثبات اتمیک‌بودن ثبت سند، command ثبت باید یک call واحد داشته باشد. تست‌ها باید این موارد را شبیه‌سازی کنند:

1. خط اول معتبر و خط دوم نامعتبر باشد.
2. debit و credit تراز نباشند.
3. شماره سند تکراری باشد.
4. account_id به حساب غیر detail یا غیرفعال اشاره کند.
5. درج audit با ورودی نامعتبر شکست بخورد.

پس از هر شکست باید بررسی شود که نه header، نه line و نه audit ناقص باقی نمانده است. اگر ثبت با دو درخواست مستقل در server function انجام شود، این تست معمولاً وجود رکورد نیمه‌کاره را آشکار می‌کند.

### ۵. تست concurrency و optimistic locking

دو session باید یک سند `submitted` را هم‌زمان با یک `version` یکسان approve کنند. انتظار می‌رود فقط یکی موفق شود و دیگری خطای stale version بگیرد. این تست ضرورت شرط زیر را بررسی می‌کند:

```sql
where id = p_entry_id
  and version = p_expected_version
  and status = 'submitted'
```

برای اجرای واقعی، دو transaction جدا یا دو worker تست ایجاد کنید. خواب‌دادن مصنوعی بین select و update می‌تواند race condition را آشکار کند، اما معیار نهایی باید قفل سطری و شرط version باشد.

### ۶. تست append-only بودن audit

با session کاربر عادی باید این عملیات‌ها رد شوند:

```sql
update public.audit_events set reason = 'tampered' where id = :audit_id;
delete from public.audit_events where id = :audit_id;
```

سپس باید بررسی شود که functionهای lifecycle، event جدید با actor درست، entity درست و before/after متفاوت ایجاد می‌کنند. کلاینت نباید بتواند `actor_id` را در payload تعیین کند؛ مقدار actor باید از `auth.uid()` گرفته شود.

### ۷. تست RLS برای دفاتر و ابعاد

برای `account_nodes` و `ledger_dimensions`، دادهٔ عمومی chart می‌تواند read-only برای کاربران احراز‌شده باشد. برای `journal_line_dimensions` باید این موارد تست شوند:

- مالک سند draft می‌تواند dimension اضافه کند.
- مالک سند posted نمی‌تواند dimension را تغییر دهد.
- کاربر دیگر نمی‌تواند dimension خط را بخواند یا تغییر دهد.
- admin می‌تواند طبق policy مشاهده کند.
- dimension نامعتبر یا غیرفعال پذیرفته نمی‌شود.

### ۸. اتصال تست دیتابیس به CI

ترتیب پیشنهادی pipeline:

```text
install dependencies
→ supabase start
→ supabase db reset
→ run migration/schema tests
→ run pgTAP tests
→ run application integration tests
→ npm run lint
→ npm run build
```

در پروژهٔ TypeScript، برای server functionها از Vitest یا ابزار تست مورد استفادهٔ TanStack استفاده کنید. Client Supabase را mock نکنید وقتی هدف تست RLS یا transaction است؛ این تست‌ها باید به database محلی متصل شوند. Mock فقط برای تست mapping خطا و رفتار UI مناسب است.

### ۹. تست‌های application-level

در سمت TypeScript حداقل این موارد را تست کنید:

- `createEntry` فقط status اولیهٔ `draft` را ارسال می‌کند.
- خطای RPC به پیام کاربرپسند تبدیل می‌شود.
- پس از submit یا approve، query سند و دفتر کل invalidate می‌شود.
- document number و مبلغ‌ها قبل از ارسال با schema runtime بررسی می‌شوند.
- UI برای statusهای مختلف دکمهٔ نامعتبر نمایش نمی‌دهد.

این تست‌ها باید با تست دیتابیس همراه باشند، زیرا مخفی‌کردن دکمهٔ `posted` در UI مانع ارسال مستقیم request نمی‌شود.

## خروجی قابل قبول CI

CI زمانی سبز است که migration از database خالی اجرا شود، همهٔ تست‌های pgTAP و integration موفق باشند، `npm run lint` بدون error اجرا شود و `npm run build` موفق باشد. شش warning فعلی Fast Refresh مانع build نیستند، اما بهتر است در کار جداگانه با تفکیک exportهای UI حذف شوند.

## References

[1]: https://supabase.com/docs/guides/local-development/overview "Supabase Local Development"
[2]: https://supabase.com/docs/guides/cli/local-development "Supabase CLI Local Development"
[3]: https://supabase.com/docs/guides/database/extensions/pg_tap "Supabase pgTAP Testing"
[4]: https://vitest.dev/guide/ "Vitest Guide"

_نویسنده: Manus AI_
