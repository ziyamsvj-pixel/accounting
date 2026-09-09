# گزارش بررسی و ادغام `accounting_core_project_v2.zip`

**تاریخ:** 2026-09-09
**مخزن مقصد:** `ziyamsvj-pixel/accounting`
**نسخه:** `accounting_core_project_v2.zip`

## نتیجه

آرشیو v2 بررسی و integrity-check شد. نسبت به نسخه موجود، قابلیت‌های عملیاتی Compliance شامل فهرست قواعد، جزئیات قاعده، منابع مقرراتی، تخصیص هزینه و queryهای server function اضافه شد. route tree و dependency lock نیز با این قابلیت‌ها همگام شدند.

فایل `.env` آرشیو عمداً وارد مخزن نشد؛ مقدارهای محیطی و credential باید از Secret/Environment تنظیم شوند. فایل Supabase migration فقط ثبت شده و روی هیچ دیتابیسی اجرا نشده است.

## اقلام ادغام‌شده

- routeهای `rules`، `sources` و `allocation` و صفحه اصلی v2؛
- `src/lib/compliance.functions.ts`؛
- client، typeها و middlewareهای Supabase در `src/integrations/supabase/`؛
- `supabase/config.toml` و migration نسخه‌دار؛
- `package.json` و `bun.lock` نسخه v2؛
- `.env` و `tsconfig.tsbuildinfo` و پوشه‌های Git وارد نشدند.

## ملاحظات اجرایی

قبل از فعال‌سازی production باید `SUPABASE_URL`، `SUPABASE_PUBLISHABLE_KEY` و در server context، `SUPABASE_SERVICE_ROLE_KEY` از محیط امن تنظیم شوند. داده‌های seed در migration با وضعیت `unverified` و قواعد با وضعیت `draft` وارد می‌شوند؛ بنابراین نباید به‌عنوان تأیید حقوقی یا منبع مقرراتی نهایی تلقی شوند.

اجرای migration، ایجاد پروژه Supabase، تغییر ساختار پایگاه‌داده یا فعال‌سازی authentication در این commit انجام نشده است.
