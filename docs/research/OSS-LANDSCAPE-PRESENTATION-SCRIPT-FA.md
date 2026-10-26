# متن ارائه مدیریتی: چشم‌انداز OSS و نقشه‌راه Accounting Core

**مدت پیشنهادی:** ۱۰ تا ۱۲ دقیقه
**مخاطب:** مدیران پروژه، مدیر مالی، مدیر محصول و مسئول فنی
**وضعیت تصمیم:** برای بررسی و تصمیم‌گیری؛ نه مجوز اجرای Database

## اسلاید ۱ — چرا این بررسی انجام شد؟

Accounting Core اکنون از یک پروژهٔ Compliance به سمت ساخت یک هستهٔ واقعی حسابداری حرکت می‌کند. برای جلوگیری از تصمیم‌گیری بر اساس حدس، سه پروژهٔ متن‌باز با سه زاویهٔ متفاوت بررسی شدند: ERPNext برای ERP کامل، Frappe Books برای تجربهٔ کاربری ساده، و Blnk برای ledger مالی دقیق.

**پیام گوینده:** هدف ما انتخاب محصول آماده برای کپی‌کردن نیست. هدف، استخراج الگوهای معماری و محصولی است که با نیازهای ایران، حاکمیت داده و مسیر فعلی پروژه سازگار باشند.

## اسلاید ۲ — ERPNext چه الگویی می‌دهد؟

ERPNext Company را مرز دفتر مستقل می‌گیرد. هر شرکت ارز پایه، سال مالی، حساب‌های پیش‌فرض و Chart of Accounts خود را دارد. سند عملیاتی پس از Submit اثر متوازن خود را در دفترکل ایجاد می‌کند و ارتباط سند منبع، GL Entry و Payment Ledger قابل پیگیری است.

**پیام گوینده:** این الگو برای ما مهم است چون نشان می‌دهد UI نباید مستقیماً Ledger را تغییر دهد. سند منبع، Application و Domain باید قبل از Posting کنترل شوند.

## اسلاید ۳ — Frappe Books چه الگویی می‌دهد؟

Frappe Books روی سادگی حسابداری، فرم‌های روشن، گزارش‌های پایه و اجرای آفلاین دسکتاپ تمرکز دارد. README مخزن، Double-entry، Journal، General Ledger، Profit and Loss، Balance Sheet و Trial Balance را به‌عنوان قابلیت‌های اصلی معرفی می‌کند.

**هشدار:** مخزن قدیمی `frappe/books` اعلام کرده که این گونهٔ Electron/Vue پایان عمر رسیده و با مخزن دیگری جایگزین شده است. بنابراین از UX آن الهام می‌گیریم، اما زیرساخت و وضعیت نگهداری را بدون بررسی دوباره انتخاب نمی‌کنیم.

## اسلاید ۴ — Blnk چه الگویی می‌دهد؟

Blnk یک ledger دوبل برای محصولات مالی است. مقدار دقیق، precision، currency، source، destination، reference و status در مدل تراکنش آن برجسته‌اند. تراکنش می‌تواند در صف باشد، در حال پردازش باشد یا اعمال شده باشد و نتیجه از طریق API یا Webhook قابل پیگیری است.

**پیام گوینده:** این مدل برای Precision، Idempotency و Reconciliation الهام‌بخش است. اما وضعیت فنی صف نباید با وضعیت کنترل داخلی سند مانند Approved یا Posted یکی گرفته شود.

## اسلاید ۵ — نیازهای اصلی Accounting Core

ستون‌های محصول ما عبارت‌اند از Tenant/Company/Branch، سال و دورهٔ مالی شمسی، سرفصل پنج‌سطحی، Party مستقل، Journal دوبل، Posting تغییرناپذیر، Rial/Toman، FX، Dimensions، Audit Trail و کنترل تفکیک وظایف.

**پیام گوینده:** این‌ها امکانات فرعی نیستند. اگر این قراردادها از ابتدا درست طراحی نشوند، افزودن فروش، خرید، انبار و مالیات بعداً پرریسک خواهد بود.

## اسلاید ۶ — تصمیم‌های معماری استخراج‌شده

از ERPNext، مرزبندی شخصیت حقوقی، سند تا دفترکل، کنترل دوره و Cancel/Amend را می‌گیریم. از Frappe Books، سادگی فرم و گزارش را می‌گیریم. از Blnk، مقدار دقیق، reference، وضعیت پردازش و ledger قابل ردیابی را می‌گیریم.

**پیام گوینده:** هیچ‌کدام جایگزین تصمیم‌های ما دربارهٔ مقررات ایران، RLS، تقویم شمسی، Rial/Toman یا ساختار Tenant نیستند.

## اسلاید ۷ — نقشه‌راه فاز صفر و یک

در F0، فقط Domain-only را تثبیت می‌کنیم: Context، تاریخ شمسی، Fiscal Period، Chart of Accounts، Party، Money و Journal. در F1، چرخهٔ Draft تا Reversed، idempotency، reversal، approval و audit event را می‌سازیم.

**پیام گوینده:** خروجی این دو فاز کد دامنه و تست است، نه Migration. این مرز عمداً حفظ می‌شود.

## اسلاید ۸ — نقشه‌راه Persistence

در F2، فقط پس از تأیید مالک، طراحی Schema و Migration برای Tenant/Company/Branch، Fiscal Period، Accounts، Party، Journal و Lines انجام می‌شود. RLS، rollback، backup، threat model و تست cross-tenant بخشی از Definition of Done هستند.

**پیام گوینده:** هیچ جدول جدیدی صرفاً برای سرعت توسعه ایجاد نمی‌شود. Database باید پس از قرارداد Domain و با سند تصمیم وارد شود.

## اسلاید ۹ — ارز، Dimensions و کنترل‌ها

در F3، Money با واحد دقیق و Currency صریح پیاده می‌شود. Rial/Toman، rounding، FX و گزارش در ارز پایه باید تست عددی داشته باشند. Dimensions باید تحلیل شعبه، واحد، پروژه یا کانال را بدون تکثیر بی‌دلیل Chart of Accounts ممکن کنند.

## اسلاید ۱۰ — Reconciliation و API

در F4، تطبیق بانکی، external reference، Import rule-based و API versioned مطرح می‌شوند. ابتدا Application Port و contract test داخلی ساخته می‌شود؛ انتشار API عمومی به احراز هویت، rate limit، idempotency و نسخه‌بندی نیاز دارد.

## اسلاید ۱۱ — Sales، Inventory و Compliance

در F5، Sales/Purchase، Inventory، VAT و Moadian به‌عنوان ماژول‌های مستقل روی Ledger پایدار قرار می‌گیرند. منطق مقررات باید versioned، source-linked و effective-dated باشد. نقشه‌راه Compliance موجود حذف نمی‌شود، بلکه به قراردادهای پایدار Accounting Core متصل خواهد شد.

## اسلاید ۱۲ — تصمیم‌های موردنیاز مدیریت

چهار تصمیم لازم است: آیا Compliance به‌صورت ماژول جدا روی Core باقی بماند؟ آیا حالت آفلاین واقعاً در محدودهٔ محصول است؟ آیا Reconciliation بعد از Posting در اولویت قرار گیرد؟ و آیا API عمومی قبل از تکمیل Persistence لازم است؟

**پیشنهاد اجرایی:** Compliance جدا بماند، آفلاین فعلاً وارد محدوده نشود، Reconciliation پس از Posting اولویت بگیرد، و API عمومی بعد از قرارداد داخلی و Persistence طراحی شود.

## اسلاید ۱۳ — وضعیت حاکمیتی و گام بعد

Proposal `PROP-2026-002` فقط برای تصمیم‌گیری ثبت شده است. این Proposal مجوز Schema، Migration، Authentication، API عمومی، سرویس خارجی یا تغییر رفتار مهم محصول نیست.

**گام بعد:** اجرای واقعی تست‌های Domain و type-check در CI، سپس ارائهٔ طرح Persistence جداگانه برای تأیید مالک.

## منابع ارائه

منابع رسمی و جزئیات مقایسه در [`OSS_LANDSCAPE_AND_ROADMAP.md`](./OSS_LANDSCAPE_AND_ROADMAP.md) آمده‌اند. منابع اصلی شامل مستندات حسابداری، Company و Chart of Accounts در ERPNext، README رسمی Frappe Books و مستندات رسمی ledger، Double-entry و transaction workflow در Blnk هستند.
