# PROPOSALS

این فایل پیشنهادهای معماری و محصول را ثبت می‌کند. ثبت Proposal به‌معنای تصویب اجرا، تغییر رفتار محصول، تغییر Schema یا ایجاد Migration نیست.

## PROP-2026-002 — چشم‌انداز OSS و نقشه‌راه Accounting Core

- **تاریخ:** ۲۰۲۶-۱۰-۲۶
- **پیشنهاددهنده:** AI Development & Quality Partner
- **وضعیت:** `DRAFT — نیازمند تصمیم مالک`
- **دامنه:** معماری Domain، محصول Accounting Core، تجربه کاربر، ledger، audit و مسیر توسعه
- **سند پژوهشی:** [`docs/research/OSS_LANDSCAPE_AND_ROADMAP.md`](../docs/research/OSS_LANDSCAPE_AND_ROADMAP.md)
- **متن ارائه:** [`docs/research/OSS-LANDSCAPE-PRESENTATION-SCRIPT-FA.md`](../docs/research/OSS-LANDSCAPE-PRESENTATION-SCRIPT-FA.md)

### مسئله

Accounting Core به یک نقشه‌راه مشخص برای عبور از نمونهٔ Compliance به هستهٔ واقعی حسابداری نیاز دارد. سه مرجع متن‌باز بررسی‌شده، هر کدام بخشی از این مسئله را بهتر نشان می‌دهند: ERPNext برای ERP و کنترل‌های حسابداری، Frappe Books برای UX ساده و آفلاین، و Blnk برای ledger دقیق و تراکنش‌های مالی قابل ردیابی.

### پیشنهاد

۱. Foundation Domain-only به‌عنوان مبنای مشترک تثبیت شود: Tenant/Company/Branch، Fiscal Year/Period، Solar Hijri Date، Chart of Accounts پنج‌سطحی، Party، Money/Currency و Journal.

۲. چرخهٔ سند به‌صورت مستقل از Persistence طراحی شود: `Draft → Submitted → Approved → Posted → Locked → Reversed`.

۳. Company مرز دفتر و کنترل دسترسی باشد و Branch، Cost Center و Dimensions برای تحلیل داخل همان شخصیت حقوقی استفاده شوند؛ جداسازی چندمستاجری با RLS و تست cross-tenant انجام شود.

۴. مقادیر پول با واحد دقیق و Currency/Precision صریح مدل شوند. Rial/Toman، rounding و FX باید policy مستقل و تست عددی داشته باشند.

۵. Ledger و Audit Trail از ابتدا source-linked، idempotent، append-only و قابل replay طراحی شوند. Hash chain یا رمزنگاری audit به Proposal فنی مستقل موکول شود.

۶. Reconciliation، API versioned، Import rule-based، Sales/Purchase، Inventory و Compliance پس از تثبیت Posting و قراردادهای Domain به‌صورت ماژول‌های جدا ساخته شوند.

### اولویت اجرایی پیشنهادی

- **F0:** قراردادهای Domain و تست invariantها
- **F1:** Workflow سند، کنترل داخلی، idempotency و reversal
- **F2:** Persistence، RLS و Trial Balance پس از تأیید Database
- **F3:** Currency، Rial/Toman، FX و Dimensions
- **F4:** Reconciliation و API
- **F5:** Sales/Purchase، Inventory، VAT و Moadian

### مواردی که این Proposal تصویب نمی‌کند

این Proposal به‌تنهایی مجوز هیچ‌یک از موارد زیر نیست:

- ایجاد یا تغییر جدول، ستون، RLS یا Migration؛
- تغییر احراز هویت یا نقش‌های کاربری؛
- اتصال سرویس خارجی، پرداخت یا سرویس پولی؛
- فعال‌سازی قانون مالیاتی یا حسابداری بدون منبع رسمی و تاریخ اثر؛
- انتشار API عمومی یا SDK؛
- فعال‌سازی حالت آفلاین و Sync؛
- حذف قابلیت موجود یا تغییر رفتار مهم محصول.

### معیار پذیرش پیش از شروع Persistence

- تست‌های Domain برای تمام invariantهای F0 سبز باشند.
- type-check و regression در CI واقعاً اجرا و موفق شده باشند.
- قراردادهای Application و مرز portهای Persistence مستند شده باشند.
- طرح Schema، Migration، Rollback، Backup، RLS و threat model جداگانه ارائه شود.
- تأیید صریح مالک برای تغییر Database دریافت شود.

### تصمیم‌های موردنیاز مالک

۱. آیا نقشه‌راه Accounting Core از نقشه‌راه Compliance جدا بماند و Compliance به‌عنوان ماژول روی قراردادهای پایدار سوار شود؟ پیشنهاد این سند: بله.

۲. آیا حالت آفلاین در محدوده محصول است؟ پیشنهاد این سند: فعلاً خیر، مگر اینکه نیاز محصول و طراحی Sync به‌صورت مستقل تصویب شود.

۳. آیا Reconciliation قبل از Sales/Purchase در اولویت است؟ پیشنهاد این سند: پس از Posting پایه، بله؛ زیرا کنترل عملیاتی و auditability را زودتر افزایش می‌دهد.

۴. آیا API عمومی پیش از تکمیل Persistence لازم است؟ پیشنهاد این سند: ابتدا internal application port و contract test، سپس API عمومی versioned.

### منابع پژوهش

منابع رسمی و ادعاهای وابسته در سند پژوهشی ثبت شده‌اند. وضعیت نگهداری، تعداد مشارکت‌کنندگان و آمار ستاره‌ها باید پیش از هر تصمیم سرمایه‌گذاری دوباره راستی‌آزمایی شوند.
