# دانش پروژه کامل‌تر - Accounting Core ERP (Python + Clean Architecture + DDD)

**پروژه:** Accounting Core  
**مالک:** ziyamsvj-pixel/accounting (ایران)  
**زبان:** Python 3.12+  
**وضعیت:** در حال تکمیل فاز ۳+ (پس از ۲ فاز قبلی)  
**تاریخ به‌روزرسانی:** ۱۴۰۵/۰۶/۱۷ (۱۴۰۴ شمسی)

---

## ۱. هدف اپلیکیشن

- هسته حسابداری یکپارچه و قابل گسترش برای شرکت‌های ایرانی  
- رعایت کامل استانداردهای حسابداری ایران (مودعی، بودجه‌بندی، صورت‌های مالی، گزارش‌های مالی)  
- پشتیبانی از **تقویم شمسی (AC-001)** و سال مالی  
- پشتیبانی از **چند شرکتی (Multi-Tenant)** با جداسازی کامل داده‌ها  
- اجرای صحیح **دوگانه حسابداری (Double-Entry)** با قوانین حسابداری  
- ثبت **جورنال ناموفق**، **ثبت باطل** و **audit کامل**  
- آماده‌سازی برای اتصال به سیستم‌های حسابداری ایرانی (مودعی، نرم‌افزارهای مالی)

**کارUsers هدف:**  
- حسابداران و حسابرسی  
- مدیران مالی شرکت‌ها  
- برنامه‌نویسان و توسعه‌دهندگان حسابداری  
- کاربران نهایی سیستم‌های حسابداری ایرانی

---

## ۲. APIها (نمونه واقعی)

- `POST /api/v1/journal-entries`  
- `GET /api/v1/journal-entries/{id}`  
- `GET /api/v1/journal-entries?tenant_id=xxx&company_id=xxx`  
- `POST /api/v1/currency-conversion`  
- `GET /api/v1/fiscal-calendar`  
- `POST /api/v1/multi-tenant/activate` (تنظیم TenantContext)

**قرارداد پاسخ:**  
- JSON  
- OpenAPI 3.1.0  
- Validation: Pydantic v2 + FastAPI  

**تأکید:**  
تا وقتی Contract API آماده نشود، **هیچ تغییری در لایه فرانت** اعمال نمی‌شود.

---

## ۳. طرحواره پایگاه داده (PostgreSQL + SQLAlchemy + Alembic)

**جدول اصلی:**

```sql
-- tenants (Multi-Tenant)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true
);

-- companies (Multi-Tenant)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    name TEXT NOT NULL,
    code TEXT,
    fiscal_year_start INTEGER,
    closing_month INTEGER
);

-- journal_entries
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    company_id UUID REFERENCES companies(id),
    journal_id TEXT NOT NULL,
    posted_at TIMESTAMPTZ DEFAULT now(),
    posted_by TEXT,
    is_posted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- journal_lines (Double-Entry)
CREATE TABLE journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES journal_entries(id),
    account_code TEXT NOT NULL,
    debit DECIMAL(18,4) DEFAULT 0 CHECK (debit >= 0),
    credit DECIMAL(18,4) DEFAULT 0 CHECK (credit >= 0),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
