# Outline اسلایدهای جلسه بازبینی پروژه

**مخزن:** `ziyamsvj-pixel/accounting`
**موضوع:** بارگذاری بسته Compliance، وضعیت فنی و حاکمیت منابع مقرراتی
**تعداد اسلاید:** ۱۲

## ۱. عنوان و هدف جلسه

- وضعیت نهایی Accounting Core و بسته Compliance.
- هدف: تأیید یکپارچگی بسته، وضعیت CI و تصمیم‌های حاکمیتی.

## ۲. نتیجه CI آخرین commit پروژه مبنا

- Commit: `aa003b2` در `accounting_core`.
- Workflow: `CI`.
- نتیجه: `completed / success`.
- Compile Python و unit tests موفق.
- Run: [33996219198](https://github.com/ziyamsvj-pixel/accounting_core/actions/runs/33996219198).

## ۳. وضعیت مخزن مقصد

- مخزن مقصد: [ziyamsvj-pixel/accounting](https://github.com/ziyamsvj-pixel/accounting).
- شاخه مقصد: `main`.
- دسترسی: Admin.
- بسته Compliance پیش‌تر در commit `f9422ee` ثبت شده بود.

## ۴. نتیجه بررسی بسته ZIP

- نام بسته: `accounting_core_compliance_package.zip`.
- تعداد فایل: ۱۶.
- آزمون archive: موفق.
- SHA-256: `181c9d92c1ab65f911670b68fd53d86375b2fa7d119c4d9e521bf846dfb07364`.
- محتوای ZIP با `compliance_package/` موجود در مخزن مقصد دقیقاً match شد.

## ۵. معماری Compliance

- Domain: `ComplianceRule` و `AllocationResult`.
- Application: `ComplianceDecision`.
- Infrastructure/documentation: چرخه عمر، منابع، امنیت و roadmap.
- تست نمونه: حفظ version قاعده.

## ۶. کنترل‌های حاکمیتی قواعد

- هر قاعده باید Authority، SourceReference، Version و بازه اعتبار داشته باشد.
- وضعیت‌های پیشنهادی: Draft، Reviewed، Approved، Active، Superseded، Retired.
- محتوای مقرراتی حدسی وارد catalog فعال نشود.

## ۷. منابع رسمی پایه

- [سامانه ملی قوانین و مقررات](https://qavanin.ir/).
- [سازمان حسابرسی](https://audit.org.ir/).
- [سازمان امور مالیاتی](https://www.intamedia.ir/).
- [درگاه بخشنامه‌های مالیاتی](https://inta.tax.gov.ir/Pages/Action/LastDocs/1).
- [درگاه خدمات مالیاتی](https://tax.gov.ir/).

## ۸. منابع تکمیلی مشروط به دامنه کسب‌وکار

- [سازمان بورس و اوراق بهادار](https://seo.ir/): برای ناشران و شرکت‌های مشمول مقررات بازار سرمایه.
- [سامانه کدال](https://www.codal.ir/): برای افشا و گزارش‌های شرکت‌های ثبت‌شده؛ منبع عملیاتی/افشایی است، نه جایگزین متن قانون.
- منابع تخصصی حسابداران رسمی فقط برای کشف و cross-check؛ منبع اولیه همچنان باید مرجع رسمی باشد.

## ۹. مدل taxonomy صورتحساب

- `internal_invoice_type` برای UX داخلی.
- `official_external_code` برای code list رسمی مرجع مالیاتی.
- هر mapping دارای نسخه، منبع و تاریخ اعتبار.
- مقادیر نمونه در production فعال نشوند.

## ۱۰. شدت هشدار و رفتار Advisor

- MVP: `Informational` و `Warning`.
- `Blocking` تا تصویب سیاست، مجوز، override و audit trail اجرا نشود.
- Advisor پیشنهاد و هشدار می‌دهد و جایگزین حسابدار یا مشاور مالیاتی نیست.

## ۱۱. ریسک‌ها و تصمیم‌های باز

- مالک محتوای مقرراتی و مسئول approval باید معرفی شود.
- migration تولیدی باید versioned و قابل rollback باشد.
- مسیر JSON اولیه در برابر SQLite/PostgreSQL باید تصویب شود.
- منبع و نسخه هر قاعده باید در خروجی کاربر نمایش داده شود.

## ۱۲. جمع‌بندی و گام بعدی

- بسته ZIP سالم و قبلاً در مخزن مقصد ثبت شده است.
- هیچ فایل تکراری یا overwrite پرریسکی انجام نشد.
- مستندات provenance و منابع تکمیلی اضافه شد.
- گام بعدی: تأیید مالک محتوا، انتخاب منابع رسمی و تصویب MVP.
