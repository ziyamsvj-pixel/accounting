# طراحی منطقی Schema چندارزی و تسعیر

**وضعیت:** طراحی پیشنهادی؛ Migration اجرایی نیست
**تاریخ:** ۲۰۲۶-۱۰-۲۶
**اصل حاکمیتی:** اجرای هر جدول یا تغییر Schema نیازمند تأیید صریح مالک و یک PR دیتابیسی جداگانه است.

## ۱. هدف

این طراحی برای پشتیبانی هم‌زمان از ریال، تومان و ارزهای خارجی تهیه شده است. هدف آن جلوگیری از چهار خطای رایج است: مخلوط‌کردن ریال و تومان، از دست‌دادن نرخ و منبع نرخ، جایگزین‌کردن نرخ تاریخی سند با نرخ امروز، و مخلوط‌کردن تفاوت تسعیر تحقق‌یافته با تحقق‌نیافته.

این فایل قرارداد منطقی و شبه-DDL است. نباید مستقیماً به‌عنوان Migration اجرا شود. نام ستون‌ها و نوع دقیق PostgreSQL باید در مرحلهٔ طراحی Persistence، همراه با RLS، Backup، Rollback و تست‌های تراکنشی، تصویب شود.

## ۲. تصمیم‌های پایه

### ۲.۱ ارزهای پایه

`IRR` واحد رسمی ریال است. `IRT` واحد نمایش/ورودی تومان است و نباید بدون Policy به‌عنوان ارز مستقل قابل Posting تلقی شود. پیشنهاد پیش‌فرض:

```text
1 IRT = 10 IRR
```

این تبدیل باید در `currency_conversions` یا کتابخانهٔ Domain ثابت و تست‌شده باشد. اگر سازمانی واقعاً دفتر قانونی را بر اساس تومان نگه می‌دارد، باید Company Policy جداگانه داشته باشد؛ تبدیل نمایش نباید ارز پایهٔ قانونی را تغییر دهد.

### ۲.۲ مقدار دقیق

مبلغ در Domain با `bigint` یا `numeric` دقیق ذخیره می‌شود، نه `float` و نه `number` جاوااسکریپت. برای هر مبلغ، `currency_code`، `minor_amount`، `scale` و `rounding_policy` مشخص است. مقدار ریالی خطوط Journal باید snapshot شود تا تغییر نرخ بعدی سند قدیمی را عوض نکند.

### ۲.۳ جهت نرخ

نرخ همیشه با این معنی ذخیره می‌شود:

```text
base_currency_code  = USD
quote_currency_code = IRR
base_units          = 1
quote_units         = 500000

معنی: 1 USD = 500,000 IRR
```

برای تبدیل:

```text
quote_amount = base_amount × quote_units / base_units
base_amount  = quote_amount × base_units / quote_units
```

این قرارداد از ذخیرهٔ یک عدد بدون جهت جلوگیری می‌کند.

## ۳. مدل موجودیت‌ها

### ۳.۱ Company و Policy ارز

```sql
-- طراحی منطقی، نه migration اجرایی
company_currency_policy (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  functional_currency_code text not null, -- معمولاً IRR
  presentation_currency_code text not null,
  default_input_currency_code text not null,
  toman_input_enabled boolean not null default true,
  toman_to_rial_numerator numeric(38, 0) not null default 10,
  toman_to_rial_denominator numeric(38, 0) not null default 1,
  rounding_policy_code text not null,
  effective_from date not null,
  effective_to date,
  approved_by uuid,
  approved_at timestamptz,
  policy_version text not null,
  created_at timestamptz not null,
  unique (company_id, policy_version)
)
```

Policy باید versioned باشد. تغییر نسبت ریال/تومان یا ارز عملیاتی نباید سابقهٔ اسناد قبلی را تغییر دهد.

### ۳.۲ Currency

```sql
currencies (
  code text primary key,               -- IRR, IRT, USD, EUR
  display_name text not null,
  minor_unit_scale smallint not null,  -- برای نمایش و مقدار دقیق
  is_legal_tender boolean not null default false,
  is_display_only boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null
)
```

قید منطقی: `is_display_only = true` نباید به‌عنوان ارز دفترکل در Company یا Journal Line انتخاب شود. `IRT` معمولاً display/input-only است.

### ۳.۳ Rate Source

```sql
fx_rate_sources (
  id uuid primary key,
  code text not null unique,            -- MANUAL, BANK, CONTRACT, CUSTOMS, TAX, API
  name text not null,
  source_url text,
  trust_level text not null,            -- UNVERIFIED, INTERNAL, OFFICIAL, APPROVED
  requires_human_approval boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null
)
```

ثبت URL به‌تنهایی منبع رسمی ایجاد نمی‌کند. Source باید توسط مسئول مقررات یا مالی تأیید شود.

### ۳.۴ Rate Type

```sql
fx_rate_types (
  code text primary key,                -- ACCOUNTING, CUSTOMS, TAX, CONTRACT, SETTLEMENT...
  name text not null,
  description text not null,
  permitted_for_posting boolean not null default false,
  requires_policy_reference boolean not null default true
)
```

نمونهٔ انواع: `ACCOUNTING`، `CUSTOMS`، `TAX`، `CONTRACT`، `BANK_BUY`، `BANK_SELL`، `SETTLEMENT` و `MANAGEMENT`. فعال‌کردن هر نوع برای Posting باید با Accounting Policy انجام شود.

### ۳.۵ Exchange Rate

```sql
exchange_rates (
  id uuid primary key,
  tenant_id uuid,
  company_id uuid,
  base_currency_code text not null references currencies(code),
  quote_currency_code text not null references currencies(code),
  rate_type_code text not null references fx_rate_types(code),
  source_id uuid not null references fx_rate_sources(id),
  base_units numeric(38, 18) not null,
  quote_units numeric(38, 18) not null,
  precision_scale smallint not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  published_at timestamptz,
  external_reference text,
  raw_payload jsonb,
  status text not null,                  -- DRAFT, PENDING_APPROVAL, APPROVED, REVOKED
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null,
  check (base_currency_code <> quote_currency_code),
  check (base_units > 0 and quote_units > 0),
  check (valid_to is null or valid_to > valid_from)
)
```

نرخ با `valid_from/valid_to` انتخاب می‌شود؛ نرخ زمان ثبت با نرخ زمان پرداخت یا پایان دوره متفاوت است و هر دو باید شناسهٔ خودشان را داشته باشند.

### ۳.۶ Rate Snapshot در سند

```sql
document_rate_snapshots (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  document_id uuid not null,
  document_version integer not null,
  purpose text not null,                 -- ACCOUNTING, CUSTOMS, TAX, SETTLEMENT
  rate_id uuid not null references exchange_rates(id),
  base_currency_code text not null,
  quote_currency_code text not null,
  base_units numeric(38, 18) not null,
  quote_units numeric(38, 18) not null,
  selected_at timestamptz not null,
  selected_by uuid,
  snapshot_hash text not null,
  unique (document_id, document_version, purpose)
)
```

وجود snapshot اجباری است؛ سند Posted نباید برای محاسبهٔ تاریخی خود دوباره `exchange_rates` را query کند.

### ۳.۷ Money Value و خطوط سند

```sql
journal_lines (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  journal_entry_id uuid not null,
  account_id uuid not null,
  party_id uuid,
  currency_code text not null references currencies(code),
  foreign_amount numeric(38, 18),
  foreign_scale smallint,
  debit_base_minor numeric(38, 0) not null default 0,
  credit_base_minor numeric(38, 0) not null default 0,
  rate_snapshot_id uuid references document_rate_snapshots(id),
  rounding_residual_base_minor numeric(38, 0) not null default 0,
  cost_center_id uuid,
  branch_id uuid,
  detail1_id uuid,
  detail2_id uuid,
  created_at timestamptz not null,
  check (debit_base_minor >= 0 and credit_base_minor >= 0),
  check (not (debit_base_minor > 0 and credit_base_minor > 0))
)
```

برای حساب ارزی، `foreign_amount` و `rate_snapshot_id` باید وجود داشته باشند. برای حساب ریالی، `currency_code` باید ارز عملکردی Company باشد یا Policy صریح دیگری وجود داشته باشد.

### ۳.۸ Journal Entry و سند تسعیر

```sql
journal_entries (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  branch_id uuid,
  fiscal_period_id uuid not null,
  source_document_type text not null,
  source_document_id uuid,
  draft_number text not null,            -- شمارهٔ موقت Draft
  document_number text,                  -- null تا Post؛ شمارهٔ قطعی یکتا و بی‌فاصله
  status text not null,                  -- DRAFT ... POSTED ... REVERSED
  document_version integer not null default 1,
  idempotency_key text not null,
  entry_date date not null,
  posted_at timestamptz,
  posted_by uuid,
  content_hash text,                     -- هنگام Post محاسبه می‌شود
  reversal_of_id uuid references journal_entries(id),
  reversed_by_id uuid references journal_entries(id),
  created_by uuid not null,
  created_at timestamptz not null,
  -- کلید idempotency در سرویس به Tenant + کاربر + Command محدود است؛ قید پایگاه‌داده هم باید کاربر را داشته باشد.
  -- این قید از سرویس سخت‌گیرانه‌تر است: یک کاربر نباید یک کلید را برای دو Command متفاوت به کار ببرد.
  unique (company_id, created_by, idempotency_key)
)

-- شمارهٔ قطعی در Company و دوره یکتاست (نسخهٔ سند جزء کلید نیست).
create unique index ux_journal_entries_document_number
  on journal_entries (company_id, fiscal_period_id, document_number)
  where document_number is not null;

-- هر سند اصلی حداکثر یک سند برگشتی دارد (جلوگیری از برگشت دوباره در Race).
create unique index ux_journal_entries_reversal_of
  on journal_entries (reversal_of_id)
  where reversal_of_id is not null;

fx_revaluation_runs (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  fiscal_period_id uuid not null,
  valuation_date date not null,
  closing_rate_policy_version text not null,
  status text not null,                  -- DRAFT, PREVIEW, POSTED, REVERSED
  source_run_id uuid,
  created_by uuid not null,
  approved_by uuid,
  posted_journal_entry_id uuid,
  created_at timestamptz not null,
  unique (company_id, fiscal_period_id, valuation_date, closing_rate_policy_version)
)

fx_revaluation_lines (
  id uuid primary key,
  run_id uuid not null,
  account_id uuid not null,
  party_id uuid,
  currency_code text not null,
  prior_book_base_minor numeric(38, 0) not null,
  closing_value_base_minor numeric(38, 0) not null,
  difference_base_minor numeric(38, 0) not null,
  gain_loss_class text not null,         -- UNREALIZED_GAIN / UNREALIZED_LOSS
  rate_snapshot_id uuid not null,
  source_balance_hash text not null
)
```

سند تسعیر پایان دوره باید یک Journal مستقل و قابل برگشت باشد. اجرای دوبارهٔ یک Run برای همان دوره و Policy باید idempotent باشد.

### ۳.۹ تفاوت تحقق‌یافته در تسویه

```sql
fx_settlement_differences (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  source_document_id uuid not null,
  settlement_document_id uuid not null,
  currency_code text not null,
  carrying_base_minor numeric(38, 0) not null,
  settlement_base_minor numeric(38, 0) not null,
  difference_base_minor numeric(38, 0) not null,
  classification text not null,           -- REALIZED_GAIN / REALIZED_LOSS
  initial_rate_snapshot_id uuid not null,
  settlement_rate_snapshot_id uuid not null,
  journal_entry_id uuid,
  created_at timestamptz not null
)
```

## ۴. واردات و صادرات

### ۴.۱ پروندهٔ واردات

```sql
import_cases (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  supplier_party_id uuid,
  contract_reference text,
  proforma_reference text,
  customs_declaration_reference text,
  transport_reference text,
  valuation_currency_code text,
  accounting_currency_code text not null,
  status text not null,
  created_at timestamptz not null
)

import_cost_components (
  id uuid primary key,
  import_case_id uuid not null,
  component_type text not null,           -- GOODS, FREIGHT, INSURANCE, DUTY, TAX, CLEARING
  original_currency_code text not null,
  original_amount numeric(38, 18) not null,
  valuation_amount_base_minor numeric(38, 0) not null,
  rate_snapshot_id uuid not null,
  capitalizable boolean not null,
  recoverable_tax boolean,
  allocation_basis text,                  -- VALUE, QUANTITY, WEIGHT, MANUAL
  created_at timestamptz not null
)
```

قیمت کالا، هزینهٔ حمل، بیمه، حقوق و عوارض، مالیات، کارمزد و هزینهٔ ترخیص جدا ثبت می‌شوند. تخصیص به موجودی یا دارایی باید به سطر و روش تخصیص قابل بازسازی متصل باشد.

### ۴.۲ پروندهٔ صادرات

```sql
export_cases (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  customer_party_id uuid,
  contract_reference text,
  proforma_reference text,
  customs_declaration_reference text,
  transport_reference text,
  revenue_recognition_policy_version text not null,
  transaction_currency_code text not null,
  status text not null,
  created_at timestamptz not null
)

export_settlements (
  id uuid primary key,
  export_case_id uuid not null,
  received_currency_code text not null,
  received_amount numeric(38, 18) not null,
  settlement_rate_snapshot_id uuid not null,
  received_at timestamptz not null,
  bank_reference text,
  journal_entry_id uuid,
  created_at timestamptz not null
)
```

شناسايی درآمد، دریافت وجه و تفاوت نرخ باید جدا از هم باشند. Export Case باید بتواند ارتباط بین قرارداد، صورتحساب، اسناد حمل، اظهارنامه، دریافت بانکی و Journal را نشان دهد.

## ۵. قیود تراکنشی و RLS

۱. درج Journal و Journal Lines باید در یک transaction انجام شود.
۲. مجموع بدهکار و بستانکار در ارز پایه باید پیش از Commit برابر باشد.
۳. `tenant_id` و `company_id` از Context احراز هویت‌شده بیاید، نه از ورودی قابل اعتماد کاربر.
۴. RLS باید Tenant، Company و Branch را با Permission و نقش ترکیب کند.
۵. ایجنت فقط می‌تواند Agent Run و Finding بنویسد؛ به Journal Posted دسترسی Update/Delete ندارد.
۶. Rateهای Approved و Snapshotهای سند Posted تغییرناپذیرند.
۷. حذف منطقی یا فیزیکی سند مالی نهایی ممنوع است؛ اصلاح با Reversal انجام می‌شود.
۸. Index ترکیبی روی `company_id, currency_code, entry_date`، `rate_type, valid_from` و `source_document_id` لازم است.
۹. دادهٔ پیوست و نرخ خام باید redaction و retention جدا داشته باشد.
۱۰. هر migration آینده باید تست rollback، RLS، backup و restore داشته باشد.

## ۶. API/Domain Contract پیشنهادی

```ts
type FxConversionRequest = {
  amount: bigint;
  fromCurrency: string;
  toCurrency: string;
  rateId: string;
  roundingPolicy: string;
};

type FxConversionResult = {
  sourceAmount: bigint;
  targetAmount: bigint;
  residual: bigint;
  rateId: string;
  rateDirection: `${string}/${string}`;
  policyVersion: string;
};

type RevaluationResult = {
  monetaryItemId: string;
  carryingAmountBase: bigint;
  closingAmountBase: bigint;
  differenceBase: bigint;
  classification: "UNREALIZED_GAIN" | "UNREALIZED_LOSS";
};
```

تابع تبدیل باید Pure و deterministic باشد. دریافت نرخ، انتخاب Policy و ثبت Journal مسئولیت Application است. هیچ Component React نباید خودش نرخ یا تبدیل را محاسبه کند.

## ۷. تست‌های لازم پیش از Migration

- تبدیل ۱ تومان به ۱۰ ریال و برگشت بدون از دست‌دادن precision؛
- تبدیل USD/EUR با جهت نرخ درست و معکوس؛
- rounding و residual برای مبلغ‌های کوچک؛
- نرخ منقضی، revoked، صفر و منفی؛
- ثبت سند با ارز خارجی و snapshot نرخ؛
- جلوگیری از تغییر snapshot Posted؛
- تسعیر پایان دوره و idempotency Run؛
- تفاوت realized/unrealized؛
- تخصیص بهای واردات با روش‌های مختلف؛
- اختلاف ارزش گمرکی و فاکتور؛
- هم‌زمانی دو کاربر روی یک سند و idempotency؛
- RLS بین دو Tenant و دو Company؛
- بازسازی Journal و دفاتر از دادهٔ پایه؛
- Backup و Restore همراه با نرخ‌ها و snapshotها.

## ۸. تأییدهای لازم

قبل از تبدیل این طرح به Migration باید مسئول مالی و مالک محصول دربارهٔ ارز عملکردی Company، تعریف تومان، نوع نرخ مجاز، منبع رسمی نرخ، حساب‌های سود و زیان تسعیر، روش شناسایی درآمد صادرات، روش بهای تمام‌شدهٔ واردات و دورهٔ نگهداری داده تصمیم بگیرند. سپس این تصمیم‌ها به ADR، Rule Pack و تست پذیرش تبدیل شوند.
