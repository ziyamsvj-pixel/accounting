# گزارش آمادگی Foundation برای ساخت واقعی Accounting Core

**تاریخ:** 2026-09-12
**شاخه:** `foundation/strengthening-2026-09-12`
**مخزن:** `ziyamsvj-pixel/accounting`

## دامنه این تغییر

بستهٔ `accounting_project_strengthening_patch.zip` بررسی و integrity-check شد. این تغییر فقط baseline کیفیت، دانش پروژه، سیاست حاکمیت و منابع را به‌روزرسانی می‌کند و هیچ جدول، ستون، migration، سیستم ورود، سرویس خارجی یا قابلیت کاربری را تغییر نمی‌دهد.

## جهت معماری محصول

ترتیب پیشنهادی برای ساخت واقعی به این شکل ثبت شد:

> Foundation → Tenant/Company/Branch → Fiscal Year/Calendar → Chart of Accounts → Party → Journal → Posting → Currency/Rial-Toman → Dimensions → Audit → Sales/Purchase → Inventory → Tax/VAT → Moadian

مواردی مانند تقویم شمسی، سرفصل پنج‌سطحی، Party مستقل، سند Immutable، تفکیک ثبت/تأیید/ثبت نهایی، Multi-Company/Multi-Tenant، Rial/Toman، FX و Audit Trail به‌عنوان ستون‌های محصول ثبت شده‌اند، نه قابلیت جانبی.

## یافته‌های فنی مهم

| موضوع | وضعیت فعلی | اقدام لازم |
|---|---|---|
| هستهٔ Python موجود | ۲۵ تست قدیمی `unittest` موفق‌اند | حفظ و گسترش تدریجی suite |
| لایهٔ Foundation جدید | چند commit در ریشهٔ مخزن اضافه شده، اما هنوز production-ready نیست | یکسان‌سازی package/import structure |
| تقویم مالی | فایل اولیه وجود دارد، اما به `jdatetime` و ماژول‌های ناموجود وابسته است | تعریف قرارداد دامنه و تست مرزی پیش از persistence |
| Journal service | مسیرهای import و نوع ورودی ناسازگار دیده می‌شود | اصلاح در شاخهٔ مستقل با تست واحد |
| Repository/UoW | بخش‌هایی placeholder هستند و به SQLAlchemy/DB runtime وابسته‌اند | فقط پس از تأیید تغییر Database تکمیل شود |
| تست‌های جدید | به `pytest`، `asyncpg` و PostgreSQL محلی وابسته‌اند | تبدیل به تست‌های قابل اجرای CI یا ثبت dependency صریح |
| فایل مستندات Python | `accounting_core/FIX_ALL_ISSUES.md.py` کد Python معتبر نیست | تغییر نام به `.md` یا خارج‌کردن از compile scope |

## تصمیم حاکمیتی

در این مرحله هیچ migration یا تغییر schema اجرا یا پیشنهاد اجرایی نشده است. قبل از هر تصمیم Database باید design شامل مدل، migration، rollback، دسترسی، RLS، تست integration و روش backup به تأیید صریح مالک برسد.

## Definition of Done مرحله بعد

مرحلهٔ بعد باید با تست‌های domain-only برای Tenant context، Fiscal calendar، پنج سطح Chart of Accounts، Party، Money/Rial-Toman، Journal balance و immutable posting شروع شود. پس از اثبات این invariants، design persistence به‌صورت جداگانه برای تأیید ارائه شود.

## نتیجه

پچ تقویت‌کننده با موفقیت در این شاخه به‌صورت مستنداتی اعمال شد. این شاخه برای بازبینی و سپس شروع پیاده‌سازی Foundation domain-only آماده است؛ اما تا پیش از اصلاح importها و تعیین قرارداد تست، ادعای «Accounting Core عملیاتی» قابل قبول نیست.
