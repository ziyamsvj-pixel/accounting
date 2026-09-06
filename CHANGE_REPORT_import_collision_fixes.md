# CHANGE REPORT — accounting_core Import Collision Fixes

**تاریخ:** 2026-09-06
**مخزن هدف:** `ziyamsvj-pixel/accounting_core` (Fork از `ziya1346/accounting_core`)
**مبنای این اصلاحات:** فایل `accounting_core.zip` که شما آپلود کردید (چک‌اوت محلی، نه لزوماً دقیقاً همان چیزی که الان روی GitHub است)
**وضعیت تأیید:** تمام موارد زیر با اجرای واقعی `python3 -m unittest` و `python3 demo.py` و `python3 main.py` تأیید شده‌اند — نه ادعا.

---

## نتیجه‌ی نهایی تأییدشده

```
Ran 25 tests in 0.192s
OK
```
`demo.py` و `main.py` هر دو بدون خطا کامل اجرا شدند.

---

## چیزی که در این zip هست

پوشه‌ی `accounting_core_fixed/` = کل درخت فایل شما، با اصلاحات زیر اعمال‌شده. اگر
ترجیح می‌دهید به‌جای جایگزینی کامل، فقط تغییرات مشخص را دستی روی مخزن خودتان اعمال
کنید، لیست دقیق زیر را دنبال کنید (هرکدام مستقل و کم‌ریسک است).

---

## تغییر ۱ — تصادم `application/services.py` (فایل) با `application/services/` (پوشه)

**مشکل:** پایتون وقتی هم یک فایل `x.py` و هم یک پوشه‌ی `x/` با همان نام در یک
دایرکتوری ببیند، پوشه را در اولویت قرار می‌دهد. `application/services/` (که
`AccountingService` جدید در آن بود) به‌طور خاموش جای `application/services.py`
(که `ChartOfAccountsService`, `JournalService`, `TrialBalanceService`,
`ClosingService` را دارد) را می‌گرفت → `ImportError` در تست‌ها.

**اقدام (طبق تأیید شما که `application/services/` یک توسعه‌ی جدید و عمدی است،
نه اشتباه):** پوشه تغییرنام یافت، نه حذف.

| عملیات | مسیر قبلی | مسیر جدید |
|---|---|---|
| Rename پوشه | `application/services/` | `application/accounting/` |

فایل‌های داخل آن پوشه (`__init__.py`, `accounting_service.py`,
`accounting_standard_service.py`) بدون تغییر محتوا فقط جابه‌جا شدند — هیچ‌کدام
Import نسبی نداشتند که با جابه‌جایی بشکند.

**فایل‌های ویرایش‌شده به‌خاطر این تغییر (فقط تغییر مسیر Import، نه منطق):**

1. `application/__init__.py`
   ```diff
   - from .services import AccountingService
   + from .accounting import AccountingService
   ```

2. `examples/full_flow_demo.py`
   ```diff
   - from application.services.accounting_service import AccountingService
   + from application.accounting.accounting_service import AccountingService
   ```

3. `examples/sqlalchemy_demo.py`
   ```diff
   - from application.services.accounting_service import AccountingService
   + from application.accounting.accounting_service import AccountingService
   ```

`application/services.py` (فایل تخت قدیمی) **دست‌نخورده باقی ماند** — همان
کلاس‌هایی که تست‌ها و `main.py`/`demo.py` به آن‌ها وابسته‌اند.

---

## تغییر ۲ — تصادم `infrastructure/repositories.py` با `infrastructure/repositories/`

**مشکل:** همان الگوی بالا، ولی این‌بار پوشه‌ی `infrastructure/repositories/`
**کاملاً خالی** بود (فقط یک `__init__.py` صفر بایتی، هیچ کد دیگری). با تأیید
صریح شما، این پوشه حذف شد چون هیچ محتوایی برای از دست دادن نداشت.

| عملیات | مسیر |
|---|---|
| حذف پوشه‌ی خالی | `infrastructure/repositories/` |

`infrastructure/repositories.py` (فایل واقعی با `SchemaBuilder`,
`SqliteAccountRepository`, `SqliteJournalRepository`, `SqliteAuditLog`)
دست‌نخورده باقی ماند.

---

## تغییر ۳ — مسیر Import اشتباه در `main.py` و `demo.py`

**مشکل:** هر دو فایل این خط را داشتند:
```python
from application.currency_conversion.services import ChartOfAccountsService, JournalService, TrialBalanceService, ClosingService
```
این مسیر (`application/currency_conversion/services.py` به‌صورت پکیج) **اصلاً
وجود نداشت** — فایل واقعی حاوی این چهار کلاس `application/services.py` است
(فایل تخت). نتیجه: اجرای مستقیم `main.py` یا `demo.py` با
`ModuleNotFoundError: No module named 'application.currency_conversion'`
شکست می‌خورد.

**اقدام:**

`main.py`:
```diff
- from application.currency_conversion.services import ChartOfAccountsService, JournalService, TrialBalanceService, ClosingService
+ from application.services import ChartOfAccountsService, JournalService, TrialBalanceService, ClosingService
```

`demo.py`:
```diff
- from application.currency_conversion.services import ChartOfAccountsService, JournalService, TrialBalanceService, ClosingService
+ from application.services import ChartOfAccountsService, JournalService, TrialBalanceService, ClosingService
```

---

## خلاصه‌ی فایل‌های تغییریافته

| فایل | نوع تغییر |
|---|---|
| `application/services/` → `application/accounting/` | Rename پوشه |
| `application/__init__.py` | ویرایش ۱ خط Import |
| `examples/full_flow_demo.py` | ویرایش ۱ خط Import |
| `examples/sqlalchemy_demo.py` | ویرایش ۱ خط Import |
| `infrastructure/repositories/` | حذف (پوشه‌ی خالی) |
| `main.py` | ویرایش ۱ خط Import |
| `demo.py` | ویرایش ۱ خط Import |

هیچ فایل دیگری تغییر نکرد. هیچ منطق کسب‌وکاری (`domain/`, `application/services.py`
محتوای داخلی، `infrastructure/repositories.py` محتوای داخلی) دست‌خورده نشد.

---

## نکته‌ی مهم درباره‌ی این zip در مقابل GitHub

این اصلاحات روی نسخه‌ای اعمال شد که شما در `accounting_core.zip` آپلود کردید —
که (طبق `git status` داخل همان zip) نسبت به `origin/main` واگرا بود (هم عقب‌تر
از چند commit، هم شامل فایل‌های محلی commit‌نشده‌ی زیادی مثل `alembic/`,
`examples/`, `domain/accounting/`, `application/dto`, `application/ports`,
`infrastructure/persistence/`). یعنی این zip لزوماً دقیقاً منعکس‌کننده‌ی چیزی
که همین الان روی `ziyamsvj-pixel/accounting_core` در GitHub است نیست.

**پیشنهاد برای اعمال امن:**
1. یک برنچ جدید بسازید (مثلاً `fix/import-collisions`).
2. یا کل `accounting_core_fixed/` را جایگزین کپی محلی خودتان کنید، یا فقط
   ۷ تغییر بالا را دستی روی مخزن فعلی خودتان اعمال کنید (احتمالاً امن‌تر، چون
   مخزن GitHub شما ممکن است با این zip یکی نباشد).
3. `python3 -m unittest discover -s tests -v` را اجرا کنید و مطمئن شوید
   نتیجه‌ی `Ran 25 tests ... OK` را می‌گیرید.
4. Commit و سپس PR به `main`.

conflict حل‌نشده‌ی `README.md` (که همچنان روی GitHub باقی مانده) در این تغییرات
دست نخورد — آن یک موضوع جداست که باید جدا تصمیم‌گیری و حل شود.
