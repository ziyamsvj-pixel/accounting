
## ۱۷. تفکیک دقیق پوشه‌ها و قرارداد مالکیت کد

ساختار پیشنهادی زیر باید به‌تدریج و در Pull Requestهای کوچک ایجاد شود. نام‌گذاری، مرز وابستگی و مالک هر پوشه باید در `CODEOWNERS` ثبت شود.

```text
src/
├── domain/
│   ├── shared/                 # DomainError، Result، Clock، شناسه و واحد دقیق
│   ├── organization/           # Tenant، Company، Branch، Access Context
│   ├── calendar/               # Solar Hijri Date، Fiscal Year، Fiscal Period
│   ├── money/                  # Currency، Money، Rate، Rounding، FX Difference
│   ├── accounts/               # Account، Account Type، CoA، سطح و parent invariant
│   ├── parties/                # Customer، Supplier، Employee، Bank و Party roles
│   ├── documents/              # سند تجاری، پیوست، شماره و چرخهٔ وضعیت
│   ├── journal/                # Journal Entry، Lines، Posting و Reversal
│   ├── ledgers/                # Ledger identity، period close و projection contract
│   ├── tax/                    # مفاهیم مالیاتی مستقل از Rule Packهای کشور
│   └── audit/                  # Audit Event، hash، actor و trace identity
├── application/
│   ├── commands/               # Create، Submit، Approve، Post، Reverse، Export
│   ├── queries/                # دفترها، تراز، کارتابل و گزارش روزانه
│   ├── ports/                  # Repository، Clock، FX Provider، Queue، Storage، Notifier
│   ├── policies/               # Approval، Segregation of Duties و idempotency
│   └── workflows/              # orchestration بدون وابستگی به UI
├── infrastructure/
│   ├── persistence/            # adapterهای Supabase/PostgreSQL و transaction boundary
│   ├── queue/                  # Outbox، Worker، Retry، Dead Letter و locking
│   ├── storage/                # Object Storage، checksum، retention و download policy
│   ├── fx/                     # دریافت، cache و provenance نرخ‌ها
│   ├── notifications/          # In-app، email و adapterهای تأییدشده
│   ├── printing/               # PDF renderer و template snapshot
│   └── security/               # secret access، encryption و redaction
├── agents/
│   ├── contracts/              # AgentInput، AgentFinding، AgentRun و schema version
│   ├── orchestrator/           # fan-out، timeout، retry و correlation
│   ├── accounting-review/      # کنترل توازن و سرفصل
│   ├── document-quality/       # OCR، duplicate و نقص پیوست
│   ├── compliance-review/      # اجرای Rule Pack و ارجاع به منبع
│   ├── ledger-reconciliation/  # مقایسهٔ Journal و Read Model
│   ├── anomaly-review/         # الگوهای غیرعادی و ریسک
│   └── daily-manager-report/   # خلاصه‌سازی findings و کارتابل مدیر
├── projections/
│   ├── journal/                # دفتر روزنامه
│   ├── general-ledger/         # دفتر کل
│   ├── subsidiary-ledger/      # دفتر معین
│   ├── detail-ledger/          # تفصیلی و ابعاد
│   └── trial-balance/          # تراز آزمایشی و reconciliation
├── printing/
│   ├── templates/              # نسخه‌های روکش A4، حرارتی و گزارش
│   ├── snapshots/              # قرارداد Snapshot غیرقابل‌تغییر
│   └── formatters/             # مبلغ به حروف، فارسی‌سازی و QR داخلی
├── routes/
│   ├── _authenticated/         # سند، کارتابل، دفاتر و مدیریت ایجنت
│   ├── reports/                # گزارش‌های فقط خواندنی
│   └── public/                 # فقط صفحات عمومی و احراز هویت
└── ui/
    ├── accounting/             # فرم‌های حسابداری و خطاهای Domain
    ├── agents/                 # نمایش finding با شدت و اقدام
    ├── ledgers/                # جدول‌های قابل فیلتر و Drill-down
    └── printing/               # پیش‌نمایش و چاپ
```

قاعدهٔ وابستگی این است: `domain ← application ← infrastructure` و `presentation` فقط از `application` یا queryهای مجاز استفاده کند. `agents` از قراردادهای Application و Read Model استفاده می‌کند و به UI یا جداول خام وابسته نمی‌شود. `supabase` نباید از داخل Domain import شود. هر Pull Request که این جهت وابستگی را نقض کند، باید رد یا با ADR توجیه شود.

پوشهٔ `tests/` نیز باید همین مرز را بازتاب دهد:

```text
tests/
├── domain/                      # بدون شبکه و بدون دیتابیس
├── application/                 # command، policy، permission و workflow
├── infrastructure/              # persistence، outbox، storage و RLS
├── agents/                      # fixture، ارزیابی، confidence و عدم‌قطعیت
├── projections/                 # بازسازی دفتر و کنترل اختلاف
├── printing/                    # PDF snapshot و چاپ فارسی
├── security/                    # tenant isolation، secret و redaction
└── contract/                    # قرارداد API، event و Rule Pack
```

## ۱۸. قرارداد فنی ایجنت و بررسی دفاتر

### ۱۸.۱ مدل رویداد و صف

رویدادهای اصلی عبارت‌اند از `DocumentCreated`، `DocumentUpdated`، `DocumentSubmitted`، `DocumentApproved`، `JournalPosted`، `JournalReversed`، `ProjectionRebuilt`، `BackupCompleted` و `RulePackPublished`. هر Event دارای `event_id`، `tenant_id`، `company_id`، `aggregate_id`، `aggregate_version`، `occurred_at`، `actor_id` و `correlation_id` است.

ثبت Event و تغییر وضعیت اصلی باید در یک تراکنش انجام شود. Worker ایجنت از Outbox می‌خواند، Event را با `event_id` به‌صورت idempotent پردازش می‌کند و نتیجه را در `agent_runs` می‌نویسد. قطع Worker نباید باعث اجرای دوباره یا صدور اخطار تکراری شود.

### ۱۸.۲ قرارداد ورودی و خروجی

```ts
interface AgentRunInput {
  runId: string;
  eventId: string;
  tenantId: string;
  companyId: string;
  documentId: string;
  documentVersion: number;
  rulesetVersion: string;
  redactedSnapshot: unknown;
}

interface AgentFinding {
  code: string;
  severity: "INFO" | "WARNING" | "HIGH_RISK" | "BLOCKING";
  blocking: boolean;
  confidence: number | null;
  title: string;
  explanation: string;
  evidence: Evidence[];
  suggestedActions: SuggestedAction[];
  sourceRefs: SourceRef[];
  expiresAt: string | null;
}
```

ایجنت باید فقط `AgentFinding` و پیشنهاد اقدام تولید کند. اقدام‌هایی مانند تغییر حساب، حذف پیوست، Post یا رد سند باید از طریق Command رسمی Application و با مجوز انسانی انجام شوند. خروجی مدل زبانی باید با JSON Schema اعتبارسنجی شود؛ خروجی نامعتبر به وضعیت `AGENT_OUTPUT_INVALID` می‌رود و نباید روی سند اثر بگذارد.

### ۱۸.۳ بررسی دفاتر پس از Posting

پس از `JournalPosted`، کنترل‌گر دفتر این مراحل را اجرا می‌کند:

۱. دریافت Snapshot سند و مقایسهٔ hash با Journal؛
۲. کنترل برابری مجموع بدهکار و بستانکار در ارز پایه؛
۳. کنترل وجود Company، Period، Account و Dimension معتبر؛
۴. بازسازی اثر سند در دفتر روزنامه و کل؛
۵. تطبیق گردش معین و تفصیلی با خطوط Journal؛
۶. کنترل اینکه سند در Projection دقیقاً یک‌بار اعمال شده باشد؛
۷. مقایسهٔ Trial Balance با جمع Journal در بازه؛
۸. ثبت discrepancy با `expected_value`، `actual_value`، `tolerance`، query fingerprint و trace؛
۹. ایجاد finding برای مدیر، بدون ویرایش خودکار Ledger؛
۱۰. تلاش مجدد یا انتقال به Dead Letter در صورت شکست فنی.

اختلاف عددی نباید با rounding قانونی اشتباه شود. tolerance باید از Policy ارز و precision بیاید و هر عبور از tolerance یک finding مستقل تولید کند.

### ۱۸.۴ صدور اخطار غیرمسدودکننده

مسیر اخطار چنین است:

```text
Event → Agent Run → Evidence Collection → Rule Evaluation
     → Finding Validation → Deduplication → In-app Alert
     → Daily Manager Inbox → Acknowledge / Resolve / Dismiss
```

Deduplication بر اساس `document_id + document_version + finding_code + rule_version` انجام می‌شود. اگر کاربر سند را اصلاح کند، finding قبلی به نسخهٔ قبلی متصل می‌ماند و finding جدید برای نسخهٔ جدید ایجاد می‌شود؛ تاریخچه پاک نمی‌شود.

اخطار باید دقیقاً بگوید چه چیزی دیده شده، چرا مهم است، منبع یا Rule کدام است، اطمینان چقدر است و کاربر چه کاری می‌تواند انجام دهد. عبارت‌های قطعی مانند «جرم» یا «تخلف قطعی» برای خروجی مدل ممنوع است؛ متن باید «احتمال»، «نیازمند بررسی» یا «کمبود اطلاعات» را متناسب با شواهد بیان کند.

## ۱۹. ارز، تسعیر و محاسبات ریالی

### ۱۹.۱ اصل مدل پول

هیچ مبلغ مالی با `number` شناور در Domain نگهداری نشود. هر مقدار باید حداقل این اجزا را داشته باشد:

```text
MoneyAmount {
  currency_code: USD | EUR | ... | IRR | IRT
  minor_amount: bigint / decimal دقیق
  scale: integer
  rate_id: شناسه نرخ مورد استفاده
  rate_source: منبع نرخ
  rate_type: نوع نرخ
  rate_timestamp: زمان نرخ
  rounding_policy: سیاست گردکردن
}
```

`IRR` و `IRT` باید دو واحد با policy روشن باشند. پیشنهاد فنی این است که ارز حسابداری قانونی Company، در صورت انتخاب ریال، `IRR` باشد و تومان فقط نمایش یا واحد ورودی کنترل‌شده باشد؛ تبدیل ۱ تومان به ۱۰ ریال باید در یک کتابخانهٔ واحد و تست‌شده انجام شود. هیچ صفحه‌ای نباید مستقلاً این تبدیل را پیاده کند.

### ۱۹.۲ نرخ و جهت تبدیل

برای جلوگیری از ابهام، نرخ با جهت صریح ذخیره شود:

```text
quote_currency = IRR
base_currency  = USD
rate = 1 USD = 500,000 IRR
```

تبدیل USD به IRR: `amount_usd × rate`.
تبدیل IRR به USD: `amount_irr ÷ rate`.
اگر نرخ به‌صورت `1 IRR = 0.000002 USD` ذخیره شود، جهت برعکس است و نباید با نرخ قبلی جمع شود.

هر نرخ دارای منبع، زمان اعلام، زمان اعتبار، نوع نرخ، precision، وضعیت تأیید و کاربر تأییدکننده است. نرخ دریافت‌شده از API بیرونی بدون provenance و validation وارد Posting نمی‌شود. نرخ یک سند Posted هرگز با نرخ امروز جایگزین نمی‌شود.

### ۱۹.۳ چندنرخی

برای پشتیبانی چندنرخی، `rate_type` حداقل می‌تواند شامل این موارد باشد: `ACCOUNTING`، `CUSTOMS`، `TAX`، `CONTRACT`، `BANK_BUY`، `BANK_SELL`، `SETTLEMENT` و `MANAGEMENT`. نام‌ها و کاربرد دقیق باید در Policy شرکت و Rule Pack کشور تأیید شوند.

هر سند فقط یک `valuation_context` اصلی برای ثبت دارد، اما می‌تواند نرخ‌های مرجع دیگری را برای گزارش نگه دارد. برای نمونه، ارزش گمرکی می‌تواند با نرخ گمرکی محاسبه شود، در حالی که ثبت حسابداری خرید بر اساس نرخ قرارداد یا نرخ مورد تأیید Accounting Policy انجام شود. این دو عدد نباید بی‌دلیل در یک ستون ادغام شوند.

```text
ForeignAmount
  ├── original_currency_amount
  ├── accounting_rate_id
  ├── accounting_amount_irr
  ├── customs_rate_id / customs_amount_irr (در صورت کاربرد)
  ├── tax_rate_id / tax_base_irr (در صورت کاربرد)
  ├── settlement_rate_id / settlement_amount_irr (هنگام تسویه)
  └── differences: realized / unrealized / customs / tax
```

### ۱۹.۴ ثبت اولیه و تسعیر پایان دوره

در ثبت اولیه، مبلغ ارز خارجی، نرخ انتخاب‌شده، مبلغ معادل ارز پایه و منبع نرخ snapshot می‌شود. در پایان دوره، اقلام پولی مانند بانک ارزی، حساب دریافتنی و پرداختنی ارزی با نرخ پایان دوره طبق Policy بازسنجی می‌شوند. تفاوت بین مبلغ دفتری قبلی و مبلغ بازسنجی‌شده باید با سند تسعیر مجزا، قابل برگشت و قابل ردیابی ثبت شود.

در زمان تسویه، تفاوت بین مبلغ دفتری و مبلغ واقعی پرداخت یا دریافت، `realized_fx_gain_loss` است. تفاوت پایان دوره که هنوز تسویه نشده، `unrealized_fx_gain_loss` است. سیستم نباید این دو را در یک حساب یا گزارش بدون برچسب ترکیب کند. حساب‌های سود و زیان تسعیر، تاریخ، نرخ قدیم، نرخ جدید و مرجع سند باید در روکش درج شوند.

IAS 21 نیز مسئلهٔ اصلی را انتخاب نرخ و گزارش آثار تغییر نرخ ارز می‌داند و برای تراکنش‌های ارزی و تبدیل به ارز عملیاتی چارچوب ارائه می‌کند [8]. نحوهٔ اعمال در ایران باید با استانداردهای ملی و Policy رسمی شرکت تطبیق داده شود.

### ۱۹.۵ واردات

برای واردات، بهتر است یک پروندهٔ Import Case از چند سند جدا تشکیل شود:

```text
Purchase Contract / Proforma
 → Shipment / BL / AWB
 → Customs Declaration
 → Customs Value and Duties
 → Freight / Insurance / Clearing Costs
 → Warehouse Receipt
 → Supplier Invoice / Payable
 → Settlement / Bank Payment
 → Landed Cost Allocation
 → FX Revaluation if open
```

سیستم باید مبلغ و ارز پروفرما، هزینهٔ حمل، بیمه، کارمزد، حقوق و عوارض، مالیات و عوارض، نرخ گمرکی، نرخ حسابداری، نرخ پرداخت بانکی و هزینهٔ تخصیص‌یافته به موجودی یا دارایی را جدا نگه دارد. هزینهٔ قابل سرمایه‌ای‌شدن، هزینهٔ دوره و مبالغ قابل استرداد مالیات نباید در یک فیلد جمع شوند.

هر قلم وارداتی باید بتواند مقدار، واحد، ارز، نرخ، ارزش ریالی، کد کالا/HS در صورت نیاز، انبار، batch و سهم هزینه‌های جانبی را نگه دارد. اختلاف بین مبلغ فاکتور، ارزش گمرکی، پرداخت بانک و رسید انبار باید finding باشد و تا تصمیم حسابدار قابل مشاهده بماند.

### ۱۹.۶ صادرات

برای صادرات، پروندهٔ Export Case باید از قرارداد یا proforma تا اسناد حمل، اظهارنامه، صورتحساب، دریافت ارز و تسعیر را پوشش دهد. اطلاعات مبلغ صادراتی، ارز قرارداد، تاریخ شناسایی درآمد طبق Policy، نرخ ثبت اولیه، هزینهٔ حمل و بیمه، کارمزد، دریافت واقعی و نرخ تسویه باید جدا ثبت شوند.

مبلغ صادراتی نباید صرفاً بر اساس زمان دریافت وجه درآمد شناسایی شود. قاعدهٔ شناسایی درآمد، کنترل کالا/خدمت، اسناد حمل و مقررات مربوط باید در Posting Strategy و Rule Pack مستند شود. اختلاف نرخ بین شناسایی، دریافت و پایان دوره باید به تفکیک realized و unrealized گزارش شود.

### ۱۹.۷ کنترل‌های الزامی ارزی

- کنترل واحد و جهت نرخ؛
- جلوگیری از ترکیب ریال و تومان؛
- الزام نرخ و منبع برای سند ارزی؛
- جلوگیری از تغییر نرخ سند Posted؛
- ثبت نرخ گمرکی، مالیاتی و حسابداری در فیلدهای جدا؛
- کنترل تاریخ اعتبار نرخ نسبت به تاریخ معامله؛
- کنترل نرخ صفر، منفی، ناقص یا خارج از محدوده؛
- کنترل rounding و residual؛
- کنترل حساب‌های ارزی بر اساس Currency؛
- گزارش open foreign monetary items؛
- سند مجزای تسعیر پایان دوره؛
- تفکیک realized و unrealized؛
- reconciliation با بانک، گمرک، فروشنده و اظهارنامه؛
- دسترسی محدود به تأیید و تغییر Rate Policy.

## ۲۰. دفتر همکاری اجباری همکاران

### ۲۰.۱ ثبت عملیات همکاران

هر همکاری باید کار خود را در GitHub Issue، Project، Branch و Pull Request انجام دهد. تغییر مستقیم روی `main` ممنوع است. برای هر کار، همکار باید قبل از شروع این موارد را بخواند: آخرین Changelog، `PROJECT_CONTEXT.md`، تصمیم‌ها و ADRهای مرتبط، PRهای باز در همان محدوده و فایل‌های منبعی که قرار است تغییر کنند.

در توضیح Issue این قالب استفاده شود:

```text
شناسه کار:
هدف:
مسئله یا نیاز:
فایل‌ها/ماژول‌های درگیر:
وابستگی به Database/Auth/Compliance:
فرض‌های فعلی:
سؤالات باز:
معیار پذیرش:
خطر بازگشت یا اثر جانبی:
```

در ابتدای هر PR، همکار باید بخش «مطالعهٔ اولیه» را تکمیل کند و لینک commitها، Issueها و اسناد مطالعه‌شده را بدهد. بدون این بخش، PR وارد بازبینی فنی نمی‌شود.

### ۲۰.۲ ثبت پرسش و پاسخ در خود نرم‌افزار پروژه

یک «دفتر همکاری و تصمیم» در خود پلتفرم یا دست‌کم در GitHub ایجاد شود. هر پرسش دارای `question_id`، Issue/PR، فایل یا خط مرتبط، پرسش‌کننده، ایجادکنندهٔ تغییر، اولویت، وضعیت و مهلت پاسخ است.

```text
OPEN → ASSIGNED → ANSWERED → ACKNOWLEDGED → CLOSED
                       └────→ NEEDS_CHANGE → REOPENED
```

اگر همکار دوم هنگام مطالعهٔ کار همکار اول پرسشی داشته باشد، باید پرسش را در همین دفتر ثبت کند و آن را به commit/PR مربوط پیوند دهد. همکار ایجادکنندهٔ تغییر موظف است پاسخ فنی یا اصلاح کد ارائه کند. اگر پاسخ نیازمند تصمیم مالک، تغییر Database یا تفسیر مقررات باشد، وضعیت پرسش `ESCALATED` می‌شود و تا تصمیم معتبر، بسته نمی‌شود.

بستن پرسش فقط با یک پاسخ متنی کافی نیست. پاسخ باید یکی از این شواهد را داشته باشد: لینک کد یا تست، اصلاح سند، ADR، تصمیم مالک، یا توضیح مستند دربارهٔ رد پیشنهاد. پرسش‌های باز و overdue در گزارش روزانهٔ مدیر پروژه نمایش داده می‌شوند.

### ۲۰.۳ قالب PR اجباری

```text
## مطالعهٔ اولیه
- اسناد خوانده‌شده:
- PR/Issueهای مرتبط:
- تصمیم‌های اثرگذار:

## تغییر
- چه چیزی تغییر کرد؟
- چه چیزی عمداً تغییر نکرد؟

## ایمنی
- Database/Auth/Secret/External service:
- ریسک داده یا مقررات:
- نیاز به تأیید مالک:

## آزمون و شواهد
- lint:
- type-check:
- unit/integration:
- regression:

## پرسش‌های باز
- سؤال:
- مسئول پاسخ:
- مهلت:

## تحویل به همکار بعدی
- وضعیت فعلی:
- گام بعدی:
- محدودیت‌ها:
- فایل‌های مهم:
```

### ۲۰.۴ Handover و الزام مطالعه

هر PR پس از merge یا تحویل باید یک Handover کوتاه در Changelog یا Issue داشته باشد: وضعیت فعلی، تصمیم‌های گرفته‌شده، تست‌های اجراشده، تست‌های اجرا‌نشده، محدودیت ابزار، ریسک‌ها و گام بعدی. همکار بعدی پیش از شروع باید این Handover را تأیید یا پرسش خود را ثبت کند.

AI Agentها نیز همین الزام را دارند. خروجی ایجنت باید شامل فایل‌های خوانده‌شده، فرض‌ها، تغییرات، تست‌ها، پرسش‌های باز و محدودیت confidence باشد. هیچ ایجنتی مجاز نیست صرفاً با عبارت «بررسی شد» کار را تحویل دهد.

## منابع تکمیلی

[8]: https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/ "IFRS IAS 21 — The Effects of Changes in Foreign Exchange Rates"
