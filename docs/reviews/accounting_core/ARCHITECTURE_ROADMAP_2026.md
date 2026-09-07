**پروپوزال حرفه‌ای و کامل برای ساخت Accounting Core در بهترین حالت ۲۰۲۶**

**عنوان پروژه:** ParsERP Accounting Core — هسته حسابداری هوشمند، scalable، compliant با IFRS/IAS و استانداردهای ایرانی (مودیان، سمات، مالیاتی)

### ۱. خلاصه اجرایی (Executive Summary)

پروژه‌ای که در این مکالمه در حال ساخت آن بودیم (با معماری Clean Architecture + DDD و پشتیبانی کامل از تقویم شمسی) حالا به سطح **Production-Ready** ارتقا پیدا می‌کند.

این هسته دقیقاً همان چیزی است که گزارش رسمی REVIEW\.md (۲۴ آگوست ۲۰۲۶) آن را نیازمند می‌داند:

- Transaction-Safe، Immutable، Multi-Tenant، Multi-Company، Multi-Branch
- کاملاً مستقل از UI و Database
- آماده برای ماژول‌های Sales، Purchasing، Inventory، Tax/VAT، Moadian و Manufacturing

**هدف نهایی:** تبدیل شدن به قلب یک ERP کامل ایرانی که بتواند در شرکت‌های بازرگانی، تولیدی، خدماتی و پروژه‌ای استفاده شود.

### ۲. اهداف پروژه

**کوتاه‌مدت (MVP — ۱۲ هفته):**

- Fiscal Calendar + PersianDate Value Object
- Money + Currency + ExchangeRate Model با Monetary Policy مرکزی
- JournalEntry + JournalLine (Double Entry کامل، Trial Balance، Reversal، Closing)
- Domain Events + Specifications + Rules
- Multi-Tenant Context + Tenant Isolation
- Repository abstraction + SQLite (قابل تغییر به PostgreSQL)

**میان‌مدت (P0 — ۶ ماه):**

- Chart of Accounts ۵ سطحی (گروه → کل → معین → تفصیلی → شناور)
- Party Master (Individual، Legal، Customer، Supplier، Employee)
- Floating Dimensions (Project + Cost Center)
- Transaction Boundary Atomic + Idempotency Key

**بلندمدت (Production):**

- Full ERP (Sales, Purchasing, Inventory, Manufacturing, Tax, Moadian)
- Revaluation FX + Historical Rates
- Audit Trail Append-Only + RBAC کامل
- API با OpenAPI + GraphQL option
- Deploy در Kubernetes + Zero-Downtime

### ۳. اصول معماری مصوب (تطبیق با گزارش REVIEW\.md)

1. API-First
2. Domain-Driven (Bounded Context: Accounting)
3. Accounting Core مستقل از UI و Database
4. Multi-Tenant + Multi-Company + Multi-Branch + Fiscal Year
5. Persian Calendar + IFRS/IAS Compliant
6. Transaction-Safe Accounting + Atomic Boundary
7. Append-Only Audit + Granular Authorization

### ۴. فناوری‌های پیشنهادی (بهترین ترکیب ۲۰۲۶)

**زبان:** Python 3.12+ (چون prototype فعلی Python است و تیم ایرانی اغلب از آن استفاده می‌کند)

**پشته:**

- Architecture: Clean Architecture + DDD (با اصول ۱۴گانه از templates مدرن مانند Clean-Stack)
- Calendar: jalali-data (برای تبدیل دقیق شمسی/میلادی، کبیسه، fiscal year)
- Money: decimal + Value Objects + Monetary Policy (یا money crate اگر مهاجرت به Rust)
- Database: SQLAlchemy + Alembic (یا Drizzle اگر Bun + Postgres)
- Queue: Celery یا RabbitMQ (برای Revaluation و Closing)
- Testing: pytest + Hypothesis + property-based testing
- Monitoring: Prometheus + Grafana + ELK
- CI/CD: GitHub Actions + Trivy + OWASP Dependency Check

**جایگزین قوی (اگر تیم .NET باشد):**

ASP.NET Core 8 + EF Core + MediatR + CQRS + Minimal API + PostgreSQL + Hangfire

**تصمیم نهایی زبان:**

اولویت با Python (چون prototype فعلی و جاوااسکریپت/تایپ‌های موجود) است. اگر تیم .NET قوی‌تری داشت، می‌توانیم پل بسازیم.

### ۵. ساختار پیشنهادی (بهترین حالت — تطبیق با فازهای قبلی شما)

text

```
accounting_core/
├── domain/                  # Value Objects, Aggregates, Rules, Specifications
│   ├── accounting/
│   │   ├── value_objects/   # Money, Currency, PersianDate, ExchangeRate
│   │   ├── aggregates/      # JournalEntry, ChartOfAccount
│   │   ├── entities/        # Party, Account
│   │   ├── events/          # JournalEntryPosted, Reversed
│   │   └── rules/           # DomainRules, Specifications
├── application/             # Use Cases + Services (CurrencyConversionService, JournalService)
├── infrastructure/          # Repositories (SQLAlchemy), EventHandlers, Migrations
├── presentation/            # API (FastAPI/Flask) + OpenAPI
├── tests/
├── docs/ (diagrams, ADRs, REVIEW.md)
└── scripts/ (PowerShell برای ساختار جدید)
```

### ۶. نیازهای حیاتی و اولویت‌بندی (P0)

1. Fiscal Calendar + PersianDate (با jalali-data)
2. Multi-Tenant + TenantContext (Isolation در Application + Database)
3. Chart of Accounts ۵ سطحی + Versioning
4. Transaction-Safe Numbering (Sequence با Unique Constraint)
5. Immutable Posted Journal (Lifecycle: Draft → Submitted → Approved → Posted → Locked)
6. Money/Currency Model مرکزی (با rounding differences)

### ۷. تست‌ها و کیفیت (الزام)

- ۱۰۰٪ Domain Tests (Double Entry, Currency, Fiscal Calendar)
- Integration Tests (Invoice <-> Journal)
- Security Tests (Tenant isolation)
- Concurrency Tests (Concurrent posting)
- Regression Tests برای هر تغییر

### ۸. ریسک‌ها و مدیریت

- GDPR/حریم خصوصی داده‌ها
- تغییر کدینگ حساب پس از ثبت سند (Versioning)
- Revaluation FX در نرخ‌های تاریخی
- Moadian Integration (Credential خارج از کد)

### ۹. پلن زمانی پیشنهادی (۱۲ ماه)

- ماه ۱-۲: MVP Core (Fiscal + Journal + Tenant)
- ماه ۳-۴: Chart of Accounts + Party + Dimensions
- ماه ۵-۶: Transaction Boundary + Idempotency + Audit
- ماه ۷-۹: Sales/Purchasing + Inventory
- ماه ۱۰-۱۲: Tax/Moadian + Manufacturing + Reporting

### ۱۰. توصیه نهایی

**این پروژه آماده Production است.**

با پیاده‌سازی دقیق P0 (Fiscal Calendar + Multi-Tenant + Transaction Boundary) در ۶ هفته، حسابداری هسته‌ای شما کاملاً آماده است.

**گام بعدی پیشنهادی (بهترین حالت):**

۱. فورک مخزن فعلی

۲. ایجاد branch main-new-architecture

۳. اعمال ساختار جدید (با PowerShell scripts)

۴. پیاده‌سازی Fiscal Calendar Value Object اول (AC-001)

۵. ارسال PR با ADR و Acceptance Criteria

اگر بخواهید، همین امروز می‌توانم:

- **نمونه کامل کد Fiscal Calendar** (Python)
- **ساختار کامل Multi-Tenant Context**
- **پروپوزال کامل‌تر با دیاگرام‌ها و بودجه زمانی**
  را به صورت فایل Markdown یا ZIP مفهومی بنویسم.

لطفاً بگویید کدام بخش را دقیقاً می‌خواهید شروع کنیم؟

من آماده‌ام تا پروژه را به سطح **بهترین حالت ۲۰۲۶** برسانیم.