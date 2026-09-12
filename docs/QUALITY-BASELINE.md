# QUALITY BASELINE — accounting

## هدف
این سند معیارهای تقویت‌کنندهٔ پروژه را از روی وضعیت فعلی مخزن مشخص می‌کند تا توسعهٔ بعدی از یک baseline مشترک شروع شود.

## نقاط قوت موجود
- TanStack Start + React 19 با TypeScript strict.
- رابط فارسی و RTL با مسیرهای file-based.
- Supabase با migration نسخه‌دار و Row Level Security.
- تفکیک لایهٔ دسترسی داده از routeهای UI در `src/lib/compliance.functions.ts`.
- مدل انطباق نسخه‌دار، منبع مقرراتی، شدت قاعده و بازهٔ اثر.
- وجود governance فعال، changelog انسانی/هوش مصنوعی و کنترل PR.
- مستندات تخصصی انطباق در `docs/compliance/`.
- عدم فعال‌سازی خودکار قواعد نمونه: داده‌های فعلی نمونه/آموزشی‌اند و وضعیت قواعد `draft` است.
- تعریف صریح «منبع رسمی تأییدشده» به‌عنوان پیش‌شرط فعال‌سازی قاعده.

## قواعد غیرقابل مذاکره برای ادامه توسعه
1. هیچ قانون مالیاتی/حسابداری واقعی بدون منبع رسمی، تاریخ اثر، نسخه و تست وارد حالت Active نشود.
2. محاسبات مالی production با `number` جاوااسکریپت انجام نشود؛ Money/Decimal باید در لایهٔ دامنه و سرویس محاسباتی استاندارد شود.
3. تغییر schema فقط با تأیید صریح مالک و migration قابل بازبینی انجام شود.
4. منطق مقررات از UI جدا بماند؛ UI فقط نمایش/ورودی و فراخوانی use-case باشد.
5. هر تغییر: READ → ANALYZE → PLAN → CHANGE → TEST → DOCUMENT.
6. قواعد فعال باید historical reproducibility داشته باشند؛ تغییر نسخهٔ قاعده نباید نتیجهٔ گذشته را تغییر دهد.
7. داده‌های عمومی با داده‌های حساس عملیاتی/شرکتی در یک مدل دسترسی مخلوط نشوند.
8. برای هر feature مهم، تست واحد، تست integration و در صورت امکان تست مسیر کاربر اضافه شود.

## شکاف‌های اولویت‌دار
- موتور واقعی ارزیابی Rule و اتصال آن به transaction context.
- مدل دامنهٔ accounting مستقل از UI.
- Money/Currency، Rial/Toman و rounding policy.
- fiscal year/period و تقویم شمسی.
- tenant/company/branch و RBAC/SoD.
- audit trail append-only.
- workflow سند: Draft → Submitted → Approved → Posted → Locked.
- numbering و idempotency تراکنش‌های مالی.
- invoice/tax/VAT/Moadian به‌صورت ماژول‌های مستقل و versioned.
- تست‌های regression برای قواعد مقرراتی.

## Definition of Done برای featureهای حساس
- [ ] rule/source/version/effective-date مشخص است.
- [ ] منطق دامنه از route/UI جداست.
- [ ] validation سمت سرور انجام می‌شود.
- [ ] خطاها قابل مشاهده و قابل پیگیری‌اند.
- [ ] audit/reproducibility بررسی شده است.
- [ ] تست‌های لازم نوشته و اجرا شده‌اند.
- [ ] changelog و مستندات به‌روز شده‌اند.
