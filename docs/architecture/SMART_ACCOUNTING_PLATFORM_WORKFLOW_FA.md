# معماری و Workflow پلتفرم حسابداری هوشمند

**وضعیت:** F0 و F1 در کد پیاده و با تست پوشش داده شده‌اند؛ F2 به بعد منتظر تصویب مدیریت است.
**تاریخ:** ۲۰۲۶-۱۰-۲۷
**مرجع ارائه:** `docs/presentations/SMART-ACCOUNTING-EXECUTIVE-PRESENTATION-SCRIPT-FA.md`

## ۱. سه اصل تصمیم‌گیری و محل اجرای آن‌ها در کد

| اصل | محل اجرا | تست |
|---|---|---|
| ثبت کاربر با ثبت قطعی یکی نیست | `src/domain/workflow.ts` (Draft → Submit → Approve → Post) و `JournalService.post` | `tests/domain/workflow-service.test.ts` |
| هشدار هوشمند با خطای قطعی Domain یکی نیست | `src/domain/journal.ts` (`checkPostingInvariants`) در برابر `src/agents/*` (همیشه `blocking=false`) | `tests/domain/agents.test.ts` |
| سند Posted قابل ویرایش مستقیم نیست | `editDraft` → `POSTED_IMMUTABLE`، Repository، `buildReversal`؛ در برنامهٔ فعلی: `src/lib/legacy-journal-guard.ts` | `workflow-service.test.ts`، `legacy-guard.test.ts` |

## ۲. لایه‌ها

```text
src/domain        ← قواعد ثابت حسابداری؛ Pure، بدون وابستگی به Supabase/React
src/application   ← Use Caseها، Portها، تراکنش، Idempotency، Outbox
src/agents        ← Agent Runtime: فقط خواندن و تولید Finding
src/lib, routes   ← Presentation و اتصال فعلی Supabase (Infrastructure)
```

قاعدهٔ وابستگی: `domain` به هیچ لایه‌ای وابسته نیست؛ `application` و `agents` فقط به `domain` وابسته‌اند. هیچ Component React نرخ یا مبلغ را خودش محاسبه نمی‌کند.

## ۳. چرخهٔ سند و ثبت هم‌زمان چند باجه

```text
DRAFT ──Submit──▶ SUBMITTED ──Approve──▶ APPROVED ──Post──▶ POSTED ──(Reversal Posted)──▶ REVERSED
  ▲                    │                     │
  └──Return to Draft───┴─────────────────────┘
```

- **Draft:** ذخیره متوقف نمی‌شود؛ ناقص‌بودن یا عدم توازن موقت به‌صورت `draftWarnings` برمی‌گردد.
- **Submit:** فقط سند متوازن با حساب‌های معتبر.
- **Approve:** نقش approver/admin؛ تفکیک وظایف (ایجادکننده تأیید نمی‌کند).
- **Post:** تراکنش اتمیک: ① invariantها ② مجوز و دوره ③ شمارهٔ قطعی یکتا در Company/دوره ④ ذخیره با قفل خوش‌بینانه ⑤ Outbox ⑥ Audit ⑦ commit.
- **Reversal:** سند جدید با سطرهای معکوس و همان snapshot نرخ؛ پس از Post آن، سند اصلی `REVERSED` می‌شود.

کنترل‌های هم‌زمانی:

| خطر | کنترل |
|---|---|
| دوبار کلیک / ارسال مجدد شبکه | Idempotency Key در هر Command؛ تکرار همان درخواست نتیجهٔ قبلی را برمی‌گرداند، کلید با بدنهٔ متفاوت رد می‌شود |
| دو کاربر روی یک سند | Optimistic Locking با `version` → `CONCURRENCY_CONFLICT` |
| شمارهٔ تکراری | تخصیص شماره داخل تراکنش Post، به تفکیک Company و دوره |
| ثبت نیمه‌کاره | rollback کامل (تست «اتمیک») |
| نشت بین سازمان‌ها | `assertScope` روی Tenant/Company/Branch در هر Command |

## ۴. ایجنت‌ها

```text
Event → Outbox → OutboxDispatcher (Retry/Dead Letter) → AgentOrchestrator → Finding → کارتابل مدیر
```

| ایجنت | فایل | نمونهٔ یافته |
|---|---|---|
| Accounting Review | `src/agents/agents.ts` | نبود پیوست، سطر ارزی بدون نرخ، شرح ناقص |
| Document/OCR Review | همان | عدم همسانی شناسهٔ فروشنده یا مبلغ فاکتور |
| Compliance Review | همان | نبود Rule Pack تأییدشده؛ قواعد با منبع رسمی |
| Ledger Integrity | همان | اختلاف Read Model با بازسازی کل Journal |
| Anomaly Review | همان | مبلغ غیرعادی، احتمال ثبت تکراری |
| Daily Manager Report | `src/agents/daily-report.ts` | جمع یافته‌های باز به تفکیک شدت، ایجنت و شعبه |

قواعد Runtime:

- خروجی ایجنت هرگز `blocking` نیست؛ اگر ایجنتی `BLOCKING` برگرداند به `HIGH_RISK` تنزل می‌یابد.
- فقط خطاهای Domain با منشأ `domain-invariants` می‌توانند `blocking=true` داشته باشند.
- هر Run با `runId`، `correlationId`، نسخهٔ ایجنت، نسخهٔ سند و `rulesetVersion` ثبت می‌شود.
- شکست یا timeout یک ایجنت بقیه را متوقف نمی‌کند و سند را تغییر نمی‌دهد.
- کلید dedupe = سند + نسخه + ایجنت + کد + نسخهٔ قواعد + hash شواهد؛ یافتهٔ ردشده با همان شواهد دوباره ساخته نمی‌شود.

### اصلاحات نسبت به نمونهٔ `docs/architecture/examples/agent-review.ts`

1. `LedgerIntegrityAgent` نمونه، جمع کل حساب در دوره را با سطرهای یک سند مقایسه می‌کرد و با ثبت سند دوم اختلاف کاذب می‌داد؛ نسخهٔ جدید با بازسازی کل Journal مقایسه می‌کند.
2. `validatePostingInvariants` نمونه دورهٔ بسته، تاریخ خارج از دوره، حساب ناشناخته/غیرفعال، سطر دوطرفه/منفی/صفر، ارز تومان و سطر ارزی بدون snapshot را بررسی نمی‌کرد؛ همه اضافه شد.
3. Orchestrator نمونه پیش از اجرای ایجنت‌ها روی خطای Domain متوقف می‌شد؛ در نسخهٔ جدید Draft هم بررسی می‌شود و خطای Domain به‌صورت یافتهٔ blocking ثبت می‌شود.
4. dedupe فقط یافتهٔ OPEN را می‌دید؛ اکنون همهٔ وضعیت‌ها.
5. timeout و ثبت Agent Run اضافه شد.

## ۵. دفاتر

- Journal منبع حقیقت است؛ `rebuildProjection` روزنامه/کل/معین/تفصیلی ۱ و ۲ را می‌سازد.
- `reconcile` اختلاف و hash را گزارش می‌کند و هیچ اصلاح خودکاری انجام نمی‌دهد.

## ۶. ارز

جزئیات در `FX_DATABASE_SCHEMA_DESIGN_FA.md`. پیاده‌سازی Domain:

- `money.ts`: مبلغ bigint، ارقام فارسی، رد گردکردن پنهان، چهار سیاست گردکردن.
- `currency.ts`: IRR ارز دفترکل، IRT فقط ورود/نمایش، Policy نسخه‌دار ریال/تومان.
- `fx.ts`: نرخ با جهت صریح، اعتبار نرخ (وضعیت، تاریخ، نوع مجاز)، تبدیل Pure با residual، snapshot با hash.
- `revaluation.ts`: تسعیر تحقق‌نیافتهٔ پایان دوره (idempotent) و تفاوت تحقق‌یافتهٔ تسویه.
- `allocation.ts`: تخصیص بهای واردات (ارزش/مقدار/وزن/دستی) بدون گم‌شدن ریال.

## ۷. وضعیت پیاده‌سازی

| فاز | وضعیت |
|---|---|
| F0 Domain و invariantها | ✅ پیاده و تست‌شده |
| F1 Workflow و Posting | ✅ لایهٔ Application با Repository درحافظه؛ منتظر Persistence |
| F2 Persistence، RLS و دفاتر | ⏸ نیازمند تأیید Migration (سیاست پروژه، توقف اجباری ۱) |
| F3 ارز و FX | 🟡 Domain آماده؛ جدول‌ها منتظر F2 و تصمیم‌های مدیریت |
| F4 Reconciliation و API | 🟡 منطق Reconcile آماده |
| F5 فروش، خرید، انبار و Compliance | ⏳ |

در برنامهٔ فعلی (بدون تغییر Schema):

- کنترل توازن سرور و پیشنهاد AI با مبلغ دقیق bigint انجام می‌شود، نه جمع اعشاری.
- حذف سند `posted` در سرور مسدود است.
- در سند `posted` فقط تکمیل معین/تفصیلی خالی مجاز است و تغییر حساب کل یا مقدار موجود مسدود است.

## ۸. اجرای تست

```bash
bun install
bun run test        # تست‌های Domain، Application و ایجنت‌ها
bun run typecheck
```

CI: `.github/workflows/domain-tests.yml` روی هر Pull Request و push به main.
