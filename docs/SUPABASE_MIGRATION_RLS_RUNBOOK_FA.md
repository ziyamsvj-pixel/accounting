# راهنمای اجرای migration و تست RLS در Supabase

## وضعیت فعلی

Migration جدید در فایل `supabase/migrations/20260921004000_add_audit_and_approval_cycle.sql` قرار دارد. در بررسی این محیط، Supabase CLI نصب نبود و اتصال به پروژهٔ Supabase نیز ارائه نشده است؛ بنابراین migration روی database واقعی اجرا نشده و فقط با lint/build برنامه بررسی شده است.

## ۱. پیش‌نیازهای محلی

Supabase CLI را نصب کنید، به پروژهٔ مورد نظر login کنید و project ref را ثبت کنید:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase migration list
```

برای اجرای امن، ابتدا پروژهٔ staging را به CLI متصل کنید. اجرای migration مستقیماً روی production بدون backup و بررسی preflight توصیه نمی‌شود. [1]

## ۲. اجرای preflight روی staging

قبل از migration، این queryها را اجرا کنید:

```sql
select status, count(*)
from public.journal_entries
group by status
order by status;

select count(*) as orphan_owners
from public.journal_entries e
left join auth.users u on u.id = e.user_id
where u.id is null;

select e.id, e.document_number
from public.journal_entries e
join public.journal_lines l on l.entry_id = e.id
where e.status in ('posted', 'locked')
group by e.id, e.document_number
having round(sum(l.debit), 2) <> round(sum(l.credit), 2);

select document_number, user_id, count(*)
from public.journal_entries
group by document_number, user_id
having count(*) > 1;
```

اگر `orphan_owners` غیرصفر است، مقداردهی `created_by` و Foreign Key در migration شکست خواهد خورد. اگر status خارج از `draft` و `posted` وجود دارد، ابتدا mapping آن statusها را مشخص کنید. اگر سند قطعی نامتوازن وجود دارد، migration schema ممکن است اجرا شود، اما دادهٔ مالی برای گزارش قطعی قابل اتکا نخواهد بود.

## ۳. اجرای database محلی

در clone پروژه:

```bash
supabase start
supabase db reset
supabase migration list
supabase test db
```

`db reset` همهٔ migrationها را از ابتدا اجرا می‌کند و برای کشف خطای ترتیب migration مناسب است. این دستور دادهٔ database محلی را حذف می‌کند؛ آن را روی production اجرا نکنید. تست‌ها در `supabase/tests/` قرار می‌گیرند و باید با fixtureهای test user اجرا شوند. [2]

## ۴. اجرای migration روی staging

پس از موفقیت reset و تست‌ها:

```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --dry-run
supabase db push
supabase migration list
```

پس از اجرا، وجود tableها، functionها، policyها و constraintها را بررسی کنید:

```sql
select to_regclass('public.audit_events');
select to_regclass('public.account_nodes');
select to_regclass('public.ledger_dimensions');
select to_regclass('public.journal_line_dimensions');

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_journal_entry', 'submit_journal_entry', 'approve_journal_entry',
    'post_journal_entry', 'lock_journal_entry', 'reverse_journal_entry'
  );
```

## ۵. تست RLS با چهار کاربر

چهار fixture بسازید: `editor_a`، `editor_b`، `viewer_c` و `admin_d`. برای هر fixture باید session واقعی authenticated ایجاد شود. تست را با service-role اجرا نکنید؛ service-role RLS را bypass می‌کند.

سناریوهای لازم:

| Actor    | عملیات                       | نتیجه                 |
| -------- | ---------------------------- | --------------------- |
| viewer_c | create journal               | رد                    |
| editor_a | create draft                 | موفق                  |
| editor_a | select سند خودش              | موفق                  |
| editor_b | select سند editor_a          | صفر رکورد یا رد       |
| editor_a | submit سند خودش              | موفق                  |
| editor_a | approve همان سند             | رد                    |
| editor_b | approve سند editor_a         | موفق، طبق policy فعلی |
| editor_b | post سند                     | رد                    |
| admin_d  | post approved                | موفق                  |
| editor_a | update/delete posted         | رد                    |
| editor_a | update audit_events          | رد                    |
| editor_b | read dimensions سند editor_a | رد                    |

برای هر transition علاوه بر status، ستون actor، timestamp، version و audit event را assert کنید.

## ۶. تست rollback و concurrency

برای transaction test، RPC ساخت سند را با این ورودی‌ها اجرا کنید:

- دو line که جمع آن‌ها برابر نیست؛
- line با مبلغ منفی؛
- line با debit و credit هم‌زمان مثبت؛
- `account_id` غیرفعال؛
- document number تکراری.

پس از خطا باید هیچ header، line یا audit event جدیدی برای همان درخواست باقی نماند. برای concurrency، دو session یک version یکسان را به `approve_journal_entry` بفرستند؛ دقیقاً یکی باید موفق و دیگری با stale version رد شود.

## ۷. rollback عملیاتی

در Supabase migrationها را با rollback خودکار فرض نکنید. قبل از `db push` از schema و دادهٔ حساس backup بگیرید و migration را در staging اجرا کنید. اگر migration شکست خورد، ابتدا علت را اصلاح کنید؛ migration جدید برای جبران بسازید، نه اینکه migration اعمال‌شده را بازنویسی کنید. اگر اجرای migration نیمه‌کاره به دلیل transaction شکست خورده باشد، وضعیت schema را با `migration list` و catalog query بررسی کنید.

## ۸. معیار پذیرش

Migration زمانی آمادهٔ production است که:

1. preflight بدون orphan و status ناشناخته باشد؛
2. `supabase db reset` موفق شود؛
3. `supabase test db` موفق شود؛
4. همهٔ سناریوهای چهار نقش برای RLS موفق شوند؛
5. تست rollback و stale version موفق شوند؛
6. `npm run lint` و `npm run build` موفق باشند؛
7. یک گزارش balance sheet با اسناد posted/locked با دفترها تراز باشد.

## References

[1]: https://supabase.com/docs/guides/cli/local-development "Supabase CLI Local Development"
[2]: https://supabase.com/docs/guides/database/extensions/pg_tap "Supabase pgTAP Testing"
[3]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security"

_نویسنده: Manus AI_
