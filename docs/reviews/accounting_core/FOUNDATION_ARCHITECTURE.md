# ParsERP Foundation Architecture

## هدف

این سند مرزهای معماری Foundation هسته حسابداری را قبل از توسعه ماژول‌های ERP مشخص می‌کند.

## Domain Boundary

```text
Tenant
  └── Company
       └── Branch
            └── Fiscal Year
                 └── Fiscal Period
                      └── Accounting Documents
```

تمام Aggregateها و Queryها باید Scope مناسب Tenant/Company/Branch/FiscalYear را رعایت کنند.

## Accounting Model

```text
Group
  └── General
       └── Subsidiary
            └── Detail
                 └── Floating Dimensions
```

Floating Dimension نباید به دو فیلد ثابت مانند `project_code` و `cost_center` محدود شود؛ Domain باید امکان اضافه‌شدن Dimensionهای جدید را بدون تغییر JournalLine فراهم کند.

## Money

Money باید شامل Currency و Decimal amount باشد. Precision و Rounding باید از یک Monetary Policy مرکزی تبعیت کنند.

برای حسابداری ایران، تفاوت Currency قانونی/حسابداری با Display Unit (ریال/تومان) باید صریح باشد و تبدیل واحد نباید به‌صورت implicit انجام شود.

## Posting Transaction

Posting باید یک Transaction Boundary واحد داشته باشد:

```text
Validate
  -> reserve number
  -> persist header/lines
  -> persist audit
  -> commit
```

هر خطا باید کل عملیات را Rollback کند.

## Numbering

شماره‌گذاری نباید با `MAX(number) + 1` انجام شود. Sequence باید با Scope مناسب و Unique Constraint در برابر درخواست‌های همزمان محافظت شود.

## Immutability

سند Posted نباید با `save()` عمومی قابل ویرایش باشد. عملیات مجاز باید Explicit باشند، مانند:

- post
- reverse
- cancel (در صورت مجاز بودن)
- adjust

## Persistence

SQLite برای Local/Test مناسب است؛ Production Target باید PostgreSQL باشد. Domain نباید مستقیماً به SQLite یا ORM وابسته باشد.

برای Transactionهای چند Repository، Unit of Work یا معادل آن لازم است.

## Security

Authorization باید در API/Application enforce شود و UI صرفاً لایه تجربه کاربری باشد. Permissionها باید Action-based باشند و امکان Separation of Duties وجود داشته باشد.

## Testing

Foundation حداقل به این تست‌ها نیاز دارد:

- Persian calendar conversion
- Fiscal year boundaries
- Tenant isolation
- Company/Branch isolation
- Double-entry invariant
- Money rounding
- Concurrent numbering
- Transaction rollback
- Posted document immutability
- Idempotency

## Current Decision

این Foundation قبل از توسعه گسترده Inventory، Manufacturing و Moadian تثبیت می‌شود.
