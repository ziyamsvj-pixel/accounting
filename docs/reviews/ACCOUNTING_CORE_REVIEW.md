# ACCOUNTING_CORE_REVIEW.md

## گزارش رسمی بررسی مخزن `ziya1346/accounting_core`

**تاریخ بررسی:** 2026-08-24  
**Branch:** `main`  
**هدف:** ارزیابی `accounting_core` به‌عنوان پایه احتمالی هسته حسابداری ParsERP-Enterprise

---

# 1. Executive Summary

`accounting_core` یک Prototype مناسب برای اثبات مفاهیم پایه حسابداری دوطرفه، تراز آزمایشی، برگشت سند، Audit و Closing است؛ اما در وضعیت فعلی برای تبدیل شدن به هسته یک ERP سازمانی ایرانی آماده Production نیست.

نیازمندی‌های مصوب محصول شامل ERP کامل ایرانی، پشتیبانی از شرکت‌های بازرگانی، تولیدی، خدماتی و پروژه‌ای، Multi-Tenant، Multi-Company، Multi-Branch، Multi-Currency، ریال/تومان، تقویم شمسی، کدینگ گروه→کل→معین→تفصیلی→تفصیلی شناور، Party مستقل، پروژه، مرکز هزینه، خرید، فروش، انبار، تولید، مالیات، ارزش افزوده و سامانه مودیان است.

**توصیه اصلی:** قبل از افزودن Featureهای متعدد، Foundation و Domain Architecture بازطراحی و تثبیت شود.

---

# 2. اصول معماری مصوب

1. API-First
2. Domain-Driven
3. Accounting Core مستقل از UI
4. Accounting Core مستقل از Database
5. Multi-Tenant
6. Multi-Company
7. Multi-Branch
8. Fiscal Year و تقویم شمسی
9. Party Master مستقل
10. Chart of Accounts پنج‌سطحی
11. Floating Dimensions
12. Project Accounting
13. Cost Center
14. Inventory
15. Manufacturing
16. Sales / Purchasing
17. Tax / VAT
18. Electronic Invoice / سامانه مودیان
19. Immutable Posted Documents
20. Transaction-Safe Accounting
21. Granular Authorization
22. Append-Only Audit Trail

---

# 3. نقاط مثبت فعلی

- ساختار Domain / Application / Infrastructure / Tests
- استفاده از Decimal برای مبالغ
- Value Object برای Money
- Currency و ExchangeRate
- JournalEntry و JournalLine
- Double Entry Validation
- Trial Balance
- Reversal
- Closing
- Audit Log
- Repository abstraction
- تست‌های پایه

# 4. شکاف‌های اصلی

- تقویم شمسی واقعی پیاده نشده
- Chart of Accounts برای ERP کامل کافی نیست
- Floating Detail واقعی وجود ندارد
- Party Master مستقل وجود ندارد
- Multi-Tenancy طراحی نشده
- Multi-Company بیشتر در حد فیلد است
- Numbering با MAX+1 برای Concurrent Registration مناسب نیست
- Transaction Boundary کامل مشخص نیست
- Idempotency وجود ندارد
- API Security طراحی نشده
- Invoice Domain وجود ندارد
- Inventory Domain وجود ندارد
- Manufacturing Domain وجود ندارد
- Tax/Moadian Domain وجود ندارد
- Currency/Exchange Rate نیازمند بازطراحی است
- Audit برای ERP سازمانی کافی نیست
- Integration/Concurrency/Security Tests کافی نیستند
- README دارای Merge Conflict حل‌نشده است

---

# 5. Critical Issues

## AC-001 — تقویم و تاریخ شمسی
**Severity:** Critical  
**Status:** Open

در Demo و تست‌ها از الگوی `date(1404, ...)` استفاده شده که در Python تاریخ میلادی است، نه تاریخ شمسی.

### Requirement
Calendar abstraction با پشتیبانی از Gregorian، Persian/Solar Hijri، تبدیل دوطرفه، Fiscal Year، Fiscal Period، Accounting Date، Document Date و Posting Date.

### Acceptance Criteria
- تاریخ شمسی معتبر در Domain
- تبدیل شمسی/میلادی تست‌شده
- سال مالی 1404 واقعاً شمسی
- تست مرزهای سال و اسفند/کبیسه

---

## AC-002 — Multi-Tenant Architecture
**Severity:** Critical  
**Status:** Open

Scope هدف:

`Tenant → Company → Branch → Fiscal Year → Module/Document`

### Acceptance Criteria
- Tenant isolation در Application و Database
- عدم مشاهده داده Tenant دیگر
- Cross-Tenant Access Tests
- TenantContext مرکزی

---

## AC-003 — Multi-Company / Multi-Branch
**Severity:** Critical  
**Status:** Open

Entityهای مستقل موردنیاز:

- Company
- Branch
- FiscalYear
- FiscalPeriod
- BusinessUnit

تمام داده‌های مالی باید Scope مشخص داشته باشند.

---

## AC-004 — Chart of Accounts
**Severity:** Critical  
**Status:** Open

Target:

`Group → General → Subsidiary → Detail → Floating Detail`

باید Template، Scope، Versioning و رفتار تغییر کدینگ پس از ثبت سند مشخص شود.

---

## AC-005 — Party Master
**Severity:** Critical  
**Status:** Open

Party باید مستقل از Account باشد و حداقل Individual، Legal Entity، Customer، Supplier، Employee، Shareholder و Other را پوشش دهد.

---

## AC-006 — Floating Dimensions
**Severity:** Critical  
**Status:** Open

وجود `project_code` و `cost_center` با Floating Detail کامل یکسان نیست.

هر JournalLine باید بتواند مجموعه‌ای از Dimensionها داشته باشد، مانند Party، Detail، Project، Cost Center و Contract.

---

## AC-007 — Immutable Posted Journal
**Severity:** Critical  
**Status:** Open

Lifecycle پیشنهادی:

`Draft → Submitted → Approved → Posted → Locked`

اصلاح فقط از طریق Adjustment، Correction، Reversal یا Cancellation Policy.

---

## AC-008 — Transaction-Safe Numbering
**Severity:** Critical  
**Status:** Open

`MAX(number) + 1` در محیط Concurrent خطرناک است.

Sequence باید Transaction-Safe و دارای Unique Constraint باشد؛ Scope پیشنهادی: Company + Branch + FiscalYear + JournalType.

---

## AC-009 — Transaction Boundary
**Severity:** Critical  
**Status:** Open

Posting باید Atomic باشد:

`BEGIN → Validate → Reserve Number → Persist Entry → Persist Lines → Audit → COMMIT`

در خطا: `ROLLBACK`.

---

## AC-010 — Idempotency
**Severity:** Critical  
**Status:** Open

برای Journal Posting، Invoice Creation، Payment، Stock Transfer و Moadian Submission باید Idempotency Key وجود داشته باشد.

---

## AC-011 — Database Integrity
**Severity:** Critical  
**Status:** Open

Database باید Foreign Key، Unique، Not Null، Check Constraint و Isolationهای Tenant/Company/Fiscal Year را enforce کند.

---

## AC-012 — Currency / Money Model
**Severity:** Critical  
**Status:** Open

Money و JournalLine باید از یک Monetary Policy مرکزی استفاده کنند: precision، rounding، tax precision و rounding differences.

---

## AC-013 — ریال / تومان
**Severity:** Critical  
**Status:** Open

باید تفاوت Currency قانونی/حسابداری با Display Unit روشن شود. پیشنهاد اولیه: IRR واحد پایه حسابداری و Toman واحد نمایش/ورودی طبق Policy.

---

## AC-014 — Exchange Rate / Revaluation
**Severity:** Critical  
**Status:** Open

پشتیبانی لازم:

- Transaction Rate
- Settlement Rate
- Closing Rate
- Historical Rate
- Revaluation
- Realized FX Gain/Loss
- Unrealized FX Gain/Loss
- Rate Source/Type
- Effective Date

---

## AC-015 — Audit Trail
**Severity:** Critical  
**Status:** Open

ثبت Who، When، What، Before، After، Why، IP، Session، Correlation ID، Source، Tenant و Company. Audit باید Append-Only باشد.

---

## AC-016 — Security / Authorization
**Severity:** Critical  
**Status:** Open

Authorization باید در API/Application اعمال شود، نه فقط UI.

نمونه Permissionها:

- Accounting.Journal.Create
- Accounting.Journal.Approve
- Accounting.Journal.Post
- Accounting.Journal.Reverse
- Sales.Invoice.Create
- Sales.Invoice.Cancel
- Tax.Invoice.Submit

---

## AC-017 — Separation of Duties
**Severity:** High/Critical  
**Status:** Open

Create / Approve / Post باید قابلیت تفکیک کاربر داشته باشد.

---

## AC-018 — Reversal Model
**Severity:** Critical  
**Status:** Open

رابطه صریح original/reversal و ثبت reason، user، timestamp لازم است و Reverse چندباره باید کنترل شود.

---

## AC-019 — Invoice Domain
**Severity:** Critical  
**Status:** Open

Domain مستقل برای SalesInvoice، PurchaseInvoice، InvoiceLine، InvoiceTax، Discount، Payment و Status.

---

## AC-020 — Tax / VAT Domain
**Severity:** Critical  
**Status:** Open

Tax، VAT، TaxRate، TaxCategory، TaxExemption، TaxPeriod و TaxTransaction باید Domain مستقل باشند.

---

## AC-021 — سامانه مودیان
**Severity:** Critical  
**Status:** Open

Flow هدف:

`Invoice → Tax Document → Electronic Invoice → Submission → Tracking → Acceptance/Rejection → Correction/Cancellation`

Credential و Certificate باید خارج از Source Code و به‌صورت امن مدیریت شوند.

---

# 6. ERP Domain Gaps

## AC-022 — Inventory
**Severity:** High**

Domain مستقل برای Product، Warehouse، Stock، Stock Movement، Receipt، Issue، Transfer و Inventory Valuation.

## AC-023 — Manufacturing
**Severity:** High**

BOM، Production Order، Material Issue، WIP، Production Receipt، Finished Goods، Production Cost و Cost Allocation.

## AC-024 — Project Accounting
**Severity:** High**

Project Revenue، Cost، Profit، Receivable، Payable و Budget vs Actual.

---

# 7. API Architecture

اصل مصوب:

`Client → API → Application → Domain → Infrastructure`

UI نباید مستقیماً به Database وصل شود و قواعد حسابداری نباید در UI قرار گیرند.

---

# 8. Testing Requirements

## Domain Tests

- Double Entry
- Balance
- Currency
- Rounding
- Fiscal Calendar
- Account hierarchy
- Dimensions

## Integration Tests

- Invoice → Journal
- Invoice → Tax
- Invoice → Moadian
- Inventory → Accounting
- Production → Accounting
- Payment → Accounting

## Security Tests

- Tenant isolation
- Company isolation
- Role isolation
- Permission bypass
- Direct API authorization

## Concurrency Tests

- Concurrent numbering
- Concurrent posting
- Duplicate request
- Transaction rollback

---

# 9. Repository Hygiene

## AC-025 — Git Conflict
**Severity:** High  
**Status:** Open

README دارای Merge Conflict حل‌نشده است.

### Required

- Resolve conflict
- Validate README
- Run tests
- Ensure clean working tree

---

# 10. Migration Strategy

توصیه: بازطراحی Domain و سپس Migration کد فعلی؛ نه تبدیل مستقیم Prototype به Production Core.

کد فعلی به‌عنوان Reference/Prototype حفظ شود و Domain Architecture جدید بر اساس نیازمندی‌های ERP طراحی شود.

---

# 11. اولویت‌بندی

## P0 — قبل از Feature Development

1. Fiscal Calendar
2. Tenant
3. Company
4. Branch
5. Fiscal Year/Period
6. Chart of Accounts
7. Party
8. Dimensions
9. Money/Currency
10. Transaction Boundary
11. Numbering
12. Security/Authorization
13. Audit
14. Immutable Posting

## P1

15. Sales
16. Purchasing
17. Tax/VAT
18. E-Invoice/Moadian
19. Inventory
20. Project Accounting

## P2

21. Manufacturing
22. Advanced FX/Revaluation
23. Advanced Costing
24. Banking integrations
25. Advanced Reporting

---

# 12. Python / .NET Decision

تصمیم زبان باید بعد از نهایی شدن Domain Model و Application Contracts گرفته شود. توصیه فعلی: Prototype موجود به‌عنوان Reference حفظ شود و سپس Python و .NET/ASP.NET Core از نظر معماری، عملکرد، تیم، استقرار و نگهداری مقایسه شوند.

---

# 13. Definition of Done

Accounting Core زمانی آماده Production است که حداقل این موارد پوشش داده شوند:

- [ ] Double Entry
- [ ] Fiscal Calendar
- [ ] Fiscal Year/Period
- [ ] Multi-Tenant
- [ ] Multi-Company
- [ ] Multi-Branch
- [ ] Chart of Accounts
- [ ] Detail/Floating Detail
- [ ] Party
- [ ] Project
- [ ] Cost Center
- [ ] Multi-Currency
- [ ] Revaluation
- [ ] Immutable Posting
- [ ] Reversal
- [ ] Transaction Safety
- [ ] Idempotency
- [ ] Audit
- [ ] RBAC
- [ ] Separation of Duties
- [ ] API
- [ ] Integration Tests
- [ ] Security Tests
- [ ] Concurrency Tests
- [ ] Database Integrity

---

# 14. درخواست رسمی از تیم سازنده

1. قبل از توسعه Featureهای جدید، این Architecture Review بررسی شود.
2. برای هر AC یک Issue/Task مستقل ایجاد شود.
3. Acceptance Criteria برای هر تغییر ارائه شود.
4. Domain Changes قبل از Implementation نهایی شوند.
5. Regression Tests اضافه شوند.
6. عملیات مالی حساس دارای Integration و Concurrency Tests باشند.
7. Merge Conflict README رفع شود.
8. تصمیم Python/.NET بعد از Architecture Review اتخاذ شود.
9. سامانه مودیان به‌عنوان Integration مستقل ولی وابسته به Tax Domain طراحی شود.
10. هیچ UI یا API نباید قواعد حسابداری را دور بزند.

---

# 15. Architectural Principle

> Accounting Core باید یک Domain مالی مستقل، دقیق، قابل تست، Transaction-Safe، Multi-Tenant و مستقل از UI/Database باشد؛ سایر ماژول‌های ERP باید از طریق Application Contracts و Domain Events/Transactions با آن تعامل کنند.

---

# 16. Review Status

**Architecture Review — In Progress**

این سند یک Living Document است و با هر بررسی جدید، AC، Decision، Open Question، Risk و Architecture Change به آن افزوده خواهد شد.

### Next Review Areas

1. Database schema
2. API contracts
3. Authentication
4. Authorization
5. Multi-tenancy enforcement
6. Transaction management
7. Persistence/repository design
8. CI/CD
9. Deployment
10. Backup/restore
11. Observability
12. Performance
13. Detailed Moadian architecture
14. Domain event strategy
15. Final Python/.NET decision
