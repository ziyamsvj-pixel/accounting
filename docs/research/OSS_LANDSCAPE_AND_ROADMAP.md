# چشم‌انداز نرم‌افزارهای متن‌باز حسابداری و نقشه‌راه Accounting Core

**تاریخ:** ۲۰۲۶-۱۰-۲۶
**وضعیت:** پژوهش معماری و پیشنهاد محصول؛ بدون مجوز اجرای تغییر حساس

## هدف سند

این سند برای مقایسهٔ سه مرجع متن‌باز تهیه شده است: ERPNext برای الگوی ERP عملیاتی، Frappe Books برای سادگی تجربهٔ کاربر و اجرای دسکتاپ، و Blnk برای الگوی ledger و تراکنش‌های مالی. هدف، انتخاب ایده‌های قابل اقتباس برای Accounting Core است؛ نه کپی‌کردن کد، مدل داده یا تصمیم‌های محصول آن پروژه‌ها.

وضعیت فعلی Accounting Core شامل TanStack Start، React، Supabase، احراز هویت، نقش‌های کاربری، اسناد حسابداری و بخش Compliance است. نقشه‌راه Compliance موجود در `docs/compliance/IMPLEMENTATION-ROADMAP.md` جداگانه باقی می‌ماند و این سند نقشه‌راه هستهٔ حسابداری را پیشنهاد می‌کند.

## مقایسهٔ معماری و قابلیت‌ها

### ERPNext

ERPNext یک الگوی ERP یکپارچه ارائه می‌کند. در مستندات رسمی آن، هر Company دارای ارز پایه، سال مالی، حساب‌های پیش‌فرض و Chart of Accounts مستقل معرفی شده است. تراکنش عملیاتی پس از Submit به رکوردهای متوازن دفترکل تبدیل می‌شود و ارتباط Source Document، GL Entry و Payment Ledger Entry برای ردیابی تشریح شده است [1].

الگوی مهم ERPNext این است که سند عملیاتی منبع حقیقت کاربر است و دفترکل نتیجهٔ کنترل‌شدهٔ ارسال سند است. این جداسازی برای Accounting Core به معنای تفکیک روشن Draft، Submitted، Approved و Posted است. همچنین تغییر سند نهایی با ویرایش مستقیم انجام نمی‌شود؛ Cancel و Amend و ثبت اثر معکوس، تاریخچه را حفظ می‌کند [1].

ERPNext برای چندشرکتی نیز مرز روشنی دارد. Company نمایندهٔ شخصیت حقوقی و دفتر مستقل است. Branch، Cost Center، Warehouse یا Accounting Dimension زمانی مناسب‌اند که فعالیت در همان شخصیت حقوقی باقی می‌ماند [2]. این تفکیک باید در طراحی Tenant/Company/Branch Accounting Core حفظ شود.

در Chart of Accounts، حساب‌های گروهی فقط ساختار درخت را سازمان می‌دهند و حساب‌های نهایی محل ثبت دفترکل هستند. مستندات ERPNext توصیه می‌کند برای تحلیل شعبه، بخش یا پروژه، به‌جای تکثیر بی‌دلیل حساب‌ها از Cost Center و Dimension استفاده شود [3].

**قابل اقتباس:** مدل Company/Branch/Dimension، زنجیرهٔ سند منبع تا دفترکل، کنترل Period/Frozen Date، Cancel/Amend به‌جای حذف، و گزارش‌های قابل ردیابی.

**غیرقابل اقتباس مستقیم:** جزئیات Workflow، مدل داده و قواعد منطقه‌ای ERPNext بدون تطبیق با Rial/Toman، تقویم شمسی، مقررات ایران، نیازهای RLS و تصمیم‌های مالک پروژه.

### Frappe Books

مخزن `frappe/books` یک نرم‌افزار حسابداری ساده با تمرکز بر کسب‌وکارهای کوچک و تجربهٔ کاربری معرفی می‌کند. قابلیت‌های اعلام‌شده شامل Double-entry، Journal Entry، General Ledger، Profit and Loss، Balance Sheet و Trial Balance است. معماری معرفی‌شده در README شامل Vue، Electron و SQLite است و اجرای آفلاین را هدف می‌گیرد [4].

نکتهٔ مهم برای ارزیابی نگهداری این است که همان مخزن اعلام می‌کند این گونهٔ Electron/Vue به پایان عمر رسیده و با مخزن دیگری با عنوان Frappe Books جایگزین شده است [4]. بنابراین از آن می‌توان برای UX، جریان ورود اطلاعات، گزارش‌ها و سادگی شروع استفاده کرد؛ اما نباید وضعیت نگهداری یا معماری آن را بدون بررسی دوباره، مبنای انتخاب زیرساخت آینده قرار داد.

**قابل اقتباس:** طراحی فرم‌های ساده، نمایش سریع گزارش‌های پایه، حالت آفلاین به‌عنوان سناریوی محصول در صورت نیاز، و تفکیک روشن عملیات روزمره از گزارش مالی.

**محدودیت برای Accounting Core:** SQLite محلی و مدل دسکتاپ به‌تنهایی پاسخ Multi-Tenant، RLS، همکاری هم‌زمان، audit مرکزی و کنترل دسترسی سازمانی را نمی‌دهد. اگر حالت آفلاین مطرح شود، باید Sync، Conflict Resolution، Idempotency و کنترل افشای داده از ابتدا طراحی شوند.

### Blnk

Blnk خود را یک ledger دوبل برای ساخت محصولات مالی معرفی می‌کند. مدل آن بر ledger، balance و transaction استوار است و برای مقدار از `precise_amount` و `precision` استفاده می‌کند تا محاسبات در واحد دقیق انجام شود [5]. راهنمای Double-entry Blnk، هر تراکنش را به انتقال برابر بین source و destination تبدیل می‌کند و نشان می‌دهد که هر دو طرف در یک رکورد قابل ردیابی‌اند [6].

Blnk برای پردازش غیرهم‌زمان نیز وضعیت‌هایی مانند `QUEUED`، `INFLIGHT` و `APPLIED` و سازوکار بررسی وضعیت با Webhook یا API دارد [7]. این الگو برای Accounting Core الهام‌بخش است، اما باید به چرخهٔ حسابداری متفاوتی مانند Draft، Submitted، Approved، Posted، Locked و Reversed نگاشت شود؛ وضعیت فنی صف با وضعیت کنترل داخلی سند یکی نیست.

**قابل اقتباس:** مقدار دقیق در واحد کوچک، Currency و Precision صریح، reference/idempotency، وضعیت‌های قابل مشاهده، source/destination قابل ردیابی، reconciliation و snapshotهای گزارش‌گیری در صورت نیاز.

**محدودیت برای Accounting Core:** مدل Blnk بیشتر برای ledger محصولات مالی و انتقال ارزش است؛ به‌تنهایی مدل کامل Company، Chart of Accounts پنج‌سطحی، Party، Fiscal Period، مالیات، صورتحساب، اسناد تجاری و الزامات حسابداری محلی نیست.

## تطبیق با نیازهای Accounting Core

| نیاز هسته | بهترین ایدهٔ مرجع | تصمیم پیشنهادی برای Accounting Core |
|---|---|---|
| Tenant/Company/Branch | ERPNext | Company به‌عنوان مرز دفتر و Branch/Dimension برای عملیات داخل همان شخصیت حقوقی |
| Fiscal Year/Period | ERPNext | Period باز/بسته/قفل‌شده همراه با Frozen Date و تست تقویم شمسی |
| Chart of Accounts | ERPNext + Foundation فعلی | پنج سطح ثابت، parent invariant، account type و تفکیک حساب گروهی از حساب قابل ثبت |
| Party | ERPNext | Party مستقل از Account و اتصال چندسندی به Receivable/Payable |
| Money/Rial/Toman | Blnk | Decimal یا bigint در واحد دقیق، Currency صریح، precision و rounding policy ثبت‌شده |
| Journal/Posting | ERPNext + Blnk | سند منبع، توازن Domain، idempotency، workflow کنترل‌شده و Posted immutable |
| Inflight/Pending | Blnk | وضعیت فنی پردازش جدا از وضعیت تأیید حسابداری؛ بدون مخلوط‌کردن Queue با Approval |
| UX | Frappe Books | فرم کوتاه، گزارش سریع، خطای قابل فهم و مسیر کاربری فارسی/RTL |
| Audit Trail | ERPNext + Blnk | لینک منبع تا اثر دفترکل، append-only event، reversal و امکان replay؛ طراحی رمزنگاری بعداً با Proposal مستقل |
| Multi-Company | ERPNext | جداسازی داده و دسترسی در سطح Company/Tenant با RLS و تست cross-tenant |
| Reconciliation | ERPNext + Blnk | تطبیق بانکی و external reference به‌عنوان ماژول مستقل پس از تثبیت Posting |

## اصول معماری قابل تصویب

۱. Domain باید invariantهای توازن، Currency، Fiscal Period، account hierarchy و immutability را بدون وابستگی به Supabase یا UI اعمال کند.

۲. Application باید Use Caseهای Create، Submit، Approve، Post، Reverse و Reconcile را orchestration کند و مجوزها و idempotency را کنترل کند.

۳. Persistence باید از طریق port/interface به Domain متصل شود. Supabase، RLS و migration نباید در منطق Domain پراکنده شوند.

۴. هر سند Posted باید شناسهٔ idempotency، نسخه، زمان، عامل تغییر، مرجع سند منبع و اثر قابل بازیابی داشته باشد.

۵. قانون مالیاتی یا حسابداری باید versioned، source-linked و effective-dated باشد. توصیهٔ یک پروژهٔ متن‌باز، جایگزین منبع رسمی مقرراتی نیست.

## نقشه‌راه پیشنهادی

### فاز F0 — قراردادهای دامنه

Tenant/Company/Branch Context، Solar Hijri Date، Fiscal Year/Period، Money/Currency، Party، Chart of Accounts و Journal به‌صورت Domain-only. خروجی این فاز فقط کد و تست است و نباید migration ایجاد کند.

### فاز F1 — چرخهٔ سند و کنترل داخلی

Draft → Submitted → Approved → Posted → Locked → Reversed، تفکیک وظایف، idempotency، ثبت منبع و تست‌های regression. در این فاز طرح Persistence تهیه می‌شود، اما اجرای آن منوط به تأیید مالک است.

### فاز F2 — Persistence و گزارش پایه

پس از تأیید Schema: جداول Tenant/Company/Branch، Fiscal Period، Chart of Accounts، Party، Journal و Journal Lines، همراه با RLS، migration قابل rollback، audit event و گزارش Trial Balance.

### فاز F3 — Currency و Dimensions

Rial/Toman، نرخ تبدیل، precision، rounding، FX gain/loss، Cost Center و Dimensions با تست‌های عددی و کنترل اثر بر گزارش‌ها.

### فاز F4 — Reconciliation و API

بانک و Import rule-based، external reference، تطبیق، API versioned و webhook/idempotency. این فاز نباید قبل از تثبیت ledger و audit اجرا شود.

### فاز F5 — Sales/Purchase، Inventory و Compliance

ماژول‌های تجاری، موجودی، VAT و Moadian به‌صورت ماژول‌های versioned و متصل به ledger. نقشه‌راه Compliance موجود باید با این فاز از طریق قراردادهای مشخص یکپارچه شود، نه با مخلوط‌کردن منطق مقررات در UI.

## تصمیم‌های باز

- آیا اولویت محصول، Accounting Core عمومی است یا Compliance برای حسابداری ایران؟ پیشنهاد این سند: Foundation و Posting مشترک باشند و Compliance به‌عنوان ماژول جدا روی قراردادهای پایدار سوار شود.
- آیا حالت آفلاین لازم است؟ اگر بله، باید پیش از طراحی آن، Sync، Conflict Resolution، encryption و retention مشخص شود.
- آیا Audit Trail رمزنگاری‌شده لازم است؟ ابتدا append-only و replay قابل اعتماد پیاده شود؛ hash chain پس از تعریف threat model و هزینهٔ نگهداری پیشنهاد شود.
- آیا API عمومی از ابتدای F4 لازم است؟ پیشنهاد: ابتدا internal application port و API contract تست‌شده، سپس انتشار عمومی با versioning و rate limit.

## نتیجه

از ERPNext باید مرزبندی Company، جریان سند تا دفترکل، کنترل دوره و گزارش‌های قابل ردیابی را آموخت. از Frappe Books باید سادگی UX و جریان‌های قابل فهم را گرفت، نه الزاماً زیرساخت محلی آن را. از Blnk باید precision، reference، وضعیت پردازش و ledger قابل ردیابی را اقتباس کرد. اولویت عملی Accounting Core باید تثبیت Domain و Posting باشد؛ هیچ پیشنهاد متن‌باز، مجوز تغییر Schema یا فعال‌سازی مقررات را صادر نمی‌کند.

## منابع

[1]: https://docs.frappe.io/erpnext/accounting-introduction "ERPNext Accounting Introduction"
[2]: https://docs.frappe.io/erpnext/company-setup "ERPNext Company Setup"
[3]: https://docs.frappe.io/erpnext/chart-of-accounts "ERPNext Chart of Accounts"
[4]: https://github.com/frappe/books "Frappe Books Repository and README"
[5]: https://docs.blnkfinance.com/ "Blnk Official Documentation"
[6]: https://docs.blnkfinance.com/guides/double-entry "Blnk Double-Entry Guide"
[7]: https://docs.blnkfinance.com/cloud/transactions/overview "Blnk Transaction Verification and Inflight Workflow"
