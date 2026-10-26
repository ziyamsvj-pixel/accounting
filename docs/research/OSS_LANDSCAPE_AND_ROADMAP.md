# الگوهای OSS و نقشه‌راه

**اصل:** اقتباس الگو، نه کپی کد.

| پروژه | الگوی اقتباس‌شده | محل در کد |
|---|---|---|
| ERPNext | سند منبع و اثر دفترکل جدا؛ کنترل دوره؛ Reversal به‌جای ویرایش | `src/domain/journal.ts`، `src/domain/workflow.ts` |
| Frappe Books | فرم ساده؛ گزارش‌های قابل فهم (تراز آزمایشی از Projection) | `src/domain/ledger.ts` (`trialBalance`) |
| Blnk | مقدار دقیق، نرخ، Reference، وضعیت تراکنش، Reconciliation | `src/domain/money.ts`، `src/domain/fx.ts`، `src/domain/ledger.ts` |

مقررات ایران، RLS، ریال/تومان و ساختار Tenant/Company/Branch در معماری خود پروژه تعریف شده‌اند.

## نقشه‌راه

- **F0** Domain و invariantها: انجام شد.
- **F1** Workflow و Posting: انجام شد (درحافظه).
- **F2** Persistence، RLS و دفاتر: پس از تأیید مالک، در PR دیتابیسی جداگانه همراه با تست RLS، Backup، Restore و Rollback.
- **F3** ارز، Dimensions و FX: جدول‌ها پس از F2.
- **F4** Reconciliation و API.
- **F5** فروش، خرید، انبار و Compliance.
