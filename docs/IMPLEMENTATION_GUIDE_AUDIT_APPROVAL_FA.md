# راهنمای پیاده‌سازی Audit Trail و چرخهٔ تأیید سند

## هدف و وضعیت فعلی

این راهنما برای مخزن `ziyamsvj-pixel/accounting` نوشته شده است. در وضعیت فعلی، جدول‌های `journal_entries` و `journal_lines` ایجاد شده‌اند و نقش‌های `viewer`، `editor` و `admin` در Supabase وجود دارند. بااین‌حال، ثبت سند از دو درج جداگانه تشکیل می‌شود، وضعیت `posted` مستقیماً از فرم دریافت می‌شود و جدول append-only برای ثبت رویدادهای حسابداری وجود ندارد. بنابراین پیش از استفادهٔ عملی باید چرخهٔ وضعیت، تراکنش ثبت سند و ممیزی در لایهٔ دیتابیس و سرور پیاده شوند.

> اصل طراحی: رابط کاربری فقط وضعیت مجاز را نمایش می‌دهد؛ مجوز و انتقال وضعیت باید در PostgreSQL و server function enforce شود.

## مدل پیشنهادی چرخهٔ سند

چرخهٔ پیشنهادی به شکل زیر است:

```text
draft → submitted → approved → posted → locked
   │         │          │
   └─────────┴──────────┴── rejected / returned

posted → reversed   (فقط با سند معکوس‌کننده و علت ثبت‌شده)
```

`draft` قابل ویرایش است. `submitted` در انتظار بررسی است. `approved` تأیید شده ولی هنوز در دفتر قطعی نشده است. `posted` قطعی و قابل استفاده در گزارش‌هاست. `locked` پس از بسته‌شدن دوره یا قفل حسابداری دیگر قابل تغییر مستقیم نیست. `rejected` یا `returned` باید علت و کاربر بررسی‌کننده را نگه دارد. اصلاح سند قطعی باید با reversal، adjustment یا correction انجام شود، نه با update مستقیم.

## مرحلهٔ ۱: تعریف enum و محدودیت‌های وضعیت

ابتدا به جای `TEXT` آزاد، وضعیت را با enum یا check constraint محدود کنید. برای migration جدید، ترتیب migrationهای موجود را حفظ کنید و migration قبلی را ویرایش نکنید.

```sql
CREATE TYPE public.journal_entry_status AS ENUM (
  'draft', 'submitted', 'approved', 'posted', 'locked', 'returned', 'reversed'
);

ALTER TABLE public.journal_entries
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.journal_entry_status
    USING status::public.journal_entry_status,
  ALTER COLUMN status SET DEFAULT 'draft'::public.journal_entry_status;
```

اگر enum در محیط فعلی خطر migration بیشتری ایجاد می‌کند، موقتاً از `CHECK (status IN (...))` استفاده کنید. در هر دو حالت، مقدار `posted` نباید از مسیر `INSERT` معمولی برای کاربر editor پذیرفته شود.

## مرحلهٔ ۲: افزودن اطلاعات چرخه و کنترل هم‌زمانی

به `journal_entries` این فیلدها را اضافه کنید:

```sql
ALTER TABLE public.journal_entries
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN posted_at timestamptz,
  ADD COLUMN posted_by uuid REFERENCES auth.users(id),
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN locked_by uuid REFERENCES auth.users(id),
  ADD COLUMN returned_at timestamptz,
  ADD COLUMN returned_by uuid REFERENCES auth.users(id),
  ADD COLUMN return_reason text,
  ADD COLUMN version integer NOT NULL DEFAULT 1;
```

برای جلوگیری از تأیید توسط همان کاربر ایجادکننده، هنگام انتقال به `approved` شرط زیر را در function اعمال کنید: `approved_by <> created_by`. چون جدول فعلی `created_by` ندارد، ابتدا `created_by uuid NOT NULL REFERENCES auth.users(id)` را اضافه کنید و داده‌های موجود را با مالک فعلی backfill کنید.

## مرحلهٔ ۳: ساخت جدول append-only ممیزی

Audit trail باید برای تغییرات مالی قابل اتکا باشد. جدول زیر باید فقط از طریق functionهای کنترل‌شده درج شود و policy آن update و delete را برای کاربران مسدود کند.

```sql
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  request_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_events_entity_idx
  ON public.audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_actor_idx
  ON public.audit_events (actor_id, occurred_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit select admin" ON public.audit_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

برای جلوگیری از حذف یا تغییر از طریق API، هیچ policy برای `UPDATE` یا `DELETE` ایجاد نکنید و grantهای این دو عملیات را نیز از نقش `authenticated` حذف کنید. درج باید در یک function `SECURITY DEFINER` با `SET search_path = public` انجام شود. دسترسی function را فقط به `authenticated` بدهید و داخل آن actor را از `auth.uid()` بگیرید، نه از پارامتر ارسالی کلاینت.

## مرحلهٔ ۴: انتقال ثبت سند به یک RPC تراکنشی

تابع `create_journal_entry` باید تمام مراحل زیر را در یک transaction انجام دهد:

1. کاربر جاری و نقش او را بررسی کند.
2. ورودی را validate کند.
3. تعداد خطوط را حداقل دو قرار دهد.
4. برای هر خط دقیقاً یکی از debit یا credit را مثبت بپذیرد.
5. جمع بدهکار و بستانکار را با precision واحد بررسی کند.
6. header سند را با وضعیت `draft` درج کند.
7. خطوط را درج کند.
8. رویداد `journal.created` را در audit ثبت کند.
9. فقط در صورت موفقیت همهٔ مراحل commit کند.

اگر هر مرحله شکست بخورد، PostgreSQL تمام تغییرات همان function را rollback می‌کند. این روش از درج جداگانهٔ header و lines در `src/lib/accounting.functions.ts` امن‌تر است.

نمونهٔ اسکلت function:

```sql
CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_entry_date date,
  p_document_number text,
  p_description text,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT public.can_edit(v_user_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  -- Validation and insertion should be implemented here.
  -- Use NUMERIC arithmetic and reject malformed JSON rows.

  INSERT INTO public.journal_entries
    (user_id, created_by, entry_date, document_number, description, status)
  VALUES
    (v_user_id, v_user_id, p_entry_date, p_document_number,
     p_description, 'draft')
  RETURNING id INTO v_entry_id;

  -- Insert journal_lines from p_lines after validation.
  -- Insert audit_events for journal.created before returning.

  RETURN v_entry_id;
END;
$$;
```

در نسخهٔ نهایی، function باید از `jsonb_to_recordset` یا یک type ورودی مشخص استفاده کند و خطای درج خطوط را به‌صورت قابل تشخیص برگرداند. برای عملیات حساس از `SECURITY INVOKER` استفاده کنید تا RLS فعال بماند؛ `SECURITY DEFINER` فقط برای helper ممیزی یا عملیاتی استفاده شود که دسترسی آن عمداً محدود و بازبینی‌شده است.

## مرحلهٔ ۵: تعریف انتقال وضعیت به‌صورت commandهای جدا

به جای یک update عمومی، functionهای زیر را بسازید:

- `submit_journal_entry(p_entry_id, p_version)`
- `return_journal_entry(p_entry_id, p_version, p_reason)`
- `approve_journal_entry(p_entry_id, p_version)`
- `post_journal_entry(p_entry_id, p_version)`
- `lock_journal_entry(p_entry_id, p_version)`
- `reverse_journal_entry(p_entry_id, p_version, p_reason)`

هر function باید وضعیت قبلی را در `WHERE` بررسی کند. برای نمونه، تأیید فقط از `submitted` به `approved` مجاز باشد:

```sql
UPDATE public.journal_entries
SET status = 'approved', approved_at = now(), approved_by = auth.uid(), version = version + 1
WHERE id = p_entry_id
  AND status = 'submitted'
  AND version = p_version
  AND user_id <> auth.uid();
```

اگر تعداد سطرهای تغییرکرده صفر بود، باید خطای `stale version`، وضعیت نامعتبر یا نبود مجوز برگردد. این کنترل از overwrite شدن تغییر کاربر دیگر جلوگیری می‌کند.

## مرحلهٔ ۶: اعمال Separation of Duties

مجوزها را از نقش کلی به permissionهای دامنه‌ای نزدیک کنید. حداقل permissionهای زیر لازم است:

| Permission         | viewer |     editor | admin |
| ------------------ | -----: | ---------: | ----: |
| دیدن سند مجاز      |    بله |        بله |   بله |
| ایجاد draft        |    خیر |        بله |   بله |
| ارسال برای بررسی   |    خیر |        بله |   بله |
| تأیید سند دیگران   |    خیر | طبق policy |   بله |
| ثبت قطعی           |    خیر | طبق policy |   بله |
| قفل دوره           |    خیر |        خیر |   بله |
| مدیریت نقش         |    خیر |        خیر |   بله |
| مشاهدهٔ audit کامل |    خیر |      محدود |   بله |

قانون پایه این است که سازندهٔ سند نتواند همان سند را تأیید کند. اگر کسب‌وکار به تأیید تک‌نفره نیاز دارد، باید آن تصمیم به‌صورت صریح در policy ثبت و در audit ذخیره شود.

## مرحلهٔ ۷: تغییر server function و رابط کاربری

در `src/lib/accounting.functions.ts`، `createEntry` را از درج مستقیم به فراخوانی RPC تغییر دهید. ورودی را با Zod validate کنید و `status` را از payload فرم حذف کنید؛ وضعیت اولیه همیشه `draft` باشد.

در `documents.new.tsx` گزینهٔ `posted` را حذف کنید. پس از ایجاد draft، دکمهٔ «ارسال برای بررسی» جداگانه نمایش دهید. در صفحهٔ جزئیات، دکمه‌های approve و post فقط بر اساس permission و status نمایش داده شوند؛ این کنترل فقط تجربهٔ کاربری است و جای policy دیتابیس را نمی‌گیرد.

پس از هر mutation، queryهای سند و دفتر کل را invalidate کنید. خطاهای RPC را به پیام عمومی تبدیل کنید و جزئیات SQL را در محیط production به کاربر نشان ندهید.

## مرحلهٔ ۸: تست‌های ضروری

قبل از merge، این سناریوها را در محیط Supabase آزمایشی اجرا کنید:

1. viewer نمی‌تواند سند ایجاد یا حذف کند.
2. editor نمی‌تواند سند کاربر دیگر را بخواند.
3. editor نمی‌تواند سند را مستقیم `posted` کند.
4. سند با بدهکار و بستانکار نامتوازن rollback می‌شود.
5. شکست درج یک خط هیچ header باقی‌مانده‌ای ایجاد نمی‌کند.
6. سازنده نمی‌تواند همان سند را approve کند.
7. approve دوباره یا با version قدیمی شکست می‌خورد.
8. audit event ایجاد، ارسال، برگشت، تأیید، ثبت قطعی و reversal ثبت می‌شود.
9. کاربر عادی نمی‌تواند audit را update یا delete کند.
10. سند posted فقط از مسیر reversal اصلاح می‌شود.

## ترتیب انتشار پیشنهادی

ابتدا migrationهای schema و policy را در محیط staging اعمال کنید. سپس RPC ثبت draft و تست‌های RLS را deploy کنید. بعد lifecycle commandها را فعال کنید و رابط کاربری را به آن‌ها متصل کنید. در نهایت برای داده‌های قبلی، وضعیت و actorهای لازم را backfill کنید و پس از بررسی audit، عملیات مستقیم update/delete را محدود کنید.

## References

[1]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security"
[2]: https://supabase.com/docs/guides/database/functions "Supabase Database Functions"
[3]: https://supabase.com/docs/guides/database/postgres/roles-and-permissions "Supabase Database Roles and Permissions"
[4]: https://www.postgresql.org/docs/current/transaction-iso.html "PostgreSQL Transaction Isolation"
[5]: https://www.postgresql.org/docs/current/plpgsql-transactions.html "PostgreSQL Transaction Management"

_نویسنده: Manus AI_
