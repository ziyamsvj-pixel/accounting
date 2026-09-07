# گزارش مقایسه و تجمیع مخازن

**مخزن اصلی:** `ziyamsvj-pixel/accounting`
**تاریخ:** 2026-09-07

## منابع بررسی‌شده

مخزن اصلی، `ziya1346/accounting`، `ziyamsvj-pixel/accounting_core` و فایل `accounting.zip` بررسی شدند. URL `ziyamsvj-pixel/accounting-core` با همین نام قابل resolve نبود و به‌عنوان مخزن ناموجود/غیرقابل‌دسترسی ثبت شد.

## تصمیم تجمیع

بسته Compliance پیش‌تر در `compliance_package/` موجود بود و آرشیو `accounting_core_compliance_package.zip` با آن بدون اختلاف تطبیق داده شده بود. از ایجاد نسخه تکراری خودداری شد.

اسکلت frontend از `accounting.zip` به مخزن اصلی اضافه شد، اما `src/routes/index.tsx` فعلی مخزن اصلی حفظ شد؛ زیرا آرشیو شامل صفحه placeholder بود و جایگزینی آن باعث از دست‌رفتن صفحه انطباق فارسی می‌شد. فایل‌های `.git`، `.workspace`، `tsconfig.tsbuildinfo` و سایر artefactهای تولیدی وارد نشدند.

مستندات و تست‌های مرجع `ziyamsvj-pixel/accounting_core` زیر `docs/reviews/accounting_core/` قرار گرفتند تا با suite فعال Python که ساختار import متفاوتی دارد مخلوط نشوند.

## موارد عمداً حذف‌نشده

هیچ مخزن فرعی، فایل موجود، مسیر نامرتبط یا سابقه Git حذف نشد. تصمیم حذف باید پس از تکمیل بازبینی و اعلام صریح مالک پروژه انجام شود.
