# PROJECT KNOWLEDGE — accounting

## 1. هدف و کاربران
این مخزن در وضعیت فعلی یک هسته/نمونهٔ قابل توسعه برای «انطباق و هوش مقرراتی در حسابداری» است، نه هنوز یک ERP کامل عملیاتی. کاربران هدف آتی شامل حسابداران، مدیران مالی، حسابرسان، کارشناسان مالیاتی و مدیران کسب‌وکار هستند.

## 2. پشته و معماری فعلی
- TanStack Start + React 19 + Vite
- TypeScript با strict mode
- Tailwind CSS v4 و shadcn/ui
- TanStack Router و React Query
- Supabase برای persistence فعلی
- مسیرها در `src/routes/`
- دسترسی داده/Server Function در `src/lib/`
- migration در `supabase/migrations/`
- مدل مرجع C# در `src-dotnet/` فعلاً فقط طراحی است و در runtime برنامه اجرا نمی‌شود.

## 3. قابلیت‌های فعلی
- صفحهٔ اصلی فارسی و RTL
- فهرست قواعد انطباق و فیلتر حوزه
- جزئیات قاعده با نسخه، شدت، وضعیت، بازهٔ اثر و منبع
- فهرست منابع مقرراتی
- ماشین‌حساب کمکی تخصیص هزینهٔ مشترک
- داده‌های نمونه در سه جدول: `regulatory_sources`، `compliance_rules`، `allocation_bases`

## 4. API/داده
در وضعیت فعلی endpointهای domain API عمومی برای حسابداری وجود ندارند. Server Functions خواندنی برای سه query اصلی وجود دارد:
- `listRules`
- `listSources`
- `listAllocationBases`

این توابع از Supabase خواندن انجام می‌دهند و داده‌ها را برای UI آماده می‌کنند.

## 5. مدل دادهٔ فعلی
### regulatory_sources
منبع مقرراتی: authority، document_type، document_number، title، issue/effective date، official_reference و verification_status.

### compliance_rules
قاعده: rule_code، version، domain، title، severity، status، effective_from/to، priority، explanation، education_note و source_id.

### allocation_bases
مبنای تخصیص: basis_key، title_fa، description و sort_order.

## 6. محدودیت‌ها و تصمیم‌های حاکمیتی
- وضعیت governance فعال است.
- تغییر schema، احراز هویت، اتصال سرویس خارجی جدید، حذف قابلیت و هزینهٔ مالی نیازمند تأیید صریح مالک است.
- تغییرات کوچک UI و bug fix بدون schema change نیاز به توقف ندارند.
- همهٔ تغییرات باید در `CHANGELOG_AI_HUMAN.md` ثبت شوند.
- تاریخچهٔ Git متصل به Lovable نباید بازنویسی شود.

## 7. اصول محصول هدف
در مسیر تکمیل پروژه، accounting core باید API-first، domain-driven، قابل حسابرسی، چندشرکتی/چندشعبه‌ای/چندمستاجری، دارای Party مستقل، سرفصل پنج‌سطحی، ابعاد شناور، سال مالی/تقویم شمسی، ارز و Rial/Toman، اسناد immutable و کنترل تفکیک وظایف باشد.

## 8. انطباق مقرراتی
Rule باید versioned و دارای source، effective date و test case باشد. وضعیت Active فقط پس از راستی‌آزمایی منبع رسمی و کنترل‌های لازم مجاز است. قواعد نباید در کد ثابت UI پراکنده شوند.

## 9. وضعیت اجرا
موارد بالا که در بخش «قابلیت‌های فعلی» آمده‌اند پیاده‌سازی‌شده‌اند. موارد بخش «اصول محصول هدف» عمدتاً roadmap/target architecture هستند و نباید به‌عنوان قابلیت موجود معرفی شوند.
