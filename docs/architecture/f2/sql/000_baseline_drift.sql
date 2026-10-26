-- F2 / 000 — هم‌ترازکردن Migrationها با پایگاه‌دادهٔ واقعی (Baseline)
-- ستون‌های معین/تفصیلی در types.ts وجود دارند ولی در هیچ Migration مخزن نیستند
-- (احتمالاً مستقیم از Lovable اضافه شده‌اند). این فایل idempotent است و روی پایگاه‌دادهٔ
-- فعلی هیچ اثری ندارد؛ فقط پایگاه‌دادهٔ تازه (staging/تست) را هم‌شکل production می‌کند.
-- پیش از اجرا: خروجی واقعی `pg_dump --schema-only` با این فرض مقایسه شود.

alter table public.journal_lines add column if not exists subsidiary_code text;
alter table public.journal_lines add column if not exists subsidiary_name text;
alter table public.journal_lines add column if not exists detail1_code text;
alter table public.journal_lines add column if not exists detail1_name text;
alter table public.journal_lines add column if not exists detail2_code text;
alter table public.journal_lines add column if not exists detail2_name text;
