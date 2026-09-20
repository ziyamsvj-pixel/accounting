# تحلیل عمیق Supabase، ساختار دیتابیس و تراکنش‌ها

## نتیجهٔ اصلی

ساختار فعلی برای MVP مناسب است، اما سه مرز امنیتی و حسابداری هنوز کامل نیستند: **تمامیت داده در دیتابیس، اتمیک‌بودن ثبت سند و حاکمیت چرخهٔ سند**. کد سرور از publishable key و RLS استفاده می‌کند و middleware توکن را بررسی می‌کند؛ بااین‌حال، اعتبارسنجی‌های حسابداری عمدتاً در TypeScript قرار دارند و ثبت header و lines در دو درخواست جدا انجام می‌شود.

## نقشهٔ فعلی اجزای Supabase

### جداول عمومی

Migration نخست جداول `regulatory_sources`، `compliance_rules` و `allocation_bases` را ایجاد می‌کند. خواندن این داده‌ها برای `anon` و `authenticated` عمومی است و policy آن با `USING (true)` تعریف شده است. این طراحی برای محتوای مقرراتی عمومی قابل قبول است، اما باید اطمینان حاصل شود که این جداول در محیط production واقعاً فقط خواندنی باقی می‌مانند؛ در صورت وجود grantهای insert/update برای نقش‌های عمومی، دادهٔ مقرراتی قابل دست‌کاری می‌شود.

Migration دوم جداول `profiles` و `user_roles` را ایجاد می‌کند. پس از ایجاد کاربر در `auth.users`، trigger تابع `handle_new_user` را اجرا می‌کند و profile و نقش پیش‌فرض `editor` را می‌سازد. این رفتار باید به‌صورت کسب‌وکاری تأیید شود؛ زیرا دادن نقش editor به همهٔ کاربران جدید حداقل‌دسترسی نیست.

### جداول اسناد

`journal_entries` شامل مالک، تاریخ، شماره، شرح، وضعیت و timestampهاست. روی `(user_id, document_number)` محدودیت یکتا وجود دارد. `journal_lines` با `ON DELETE CASCADE` به header متصل است و برای `entry_id` index دارد.

دو خلأ مهم وجود دارد. نخست، `journal_entries.user_id` در migration فعلی Foreign Key به `auth.users` ندارد. دوم، هیچ مدل tenant/company، شعبه، سال مالی، نوع دفتر یا currency وجود ندارد. در نتیجه، مدل مالکیت فعلی برای دفتر شخصی مناسب‌تر از سیستم حسابداری چندشرکتی است.

## تحلیل policyهای RLS

policyهای `journal_entries` این رفتار را دارند:

- select برای مالک یا admin مجاز است.
- insert فقط برای مالک و کاربر دارای `can_edit` مجاز است.
- update فقط برای مالک دارای `can_edit` مجاز است.
- delete فقط برای مالک دارای `can_edit` مجاز است.

policyهای `journal_lines` دسترسی را از طریق وجود header بررسی می‌کنند. این کار از خواندن خطوط سند دیگران جلوگیری می‌کند و رابطهٔ مالکیت را به header متصل نگه می‌دارد.

بااین‌حال، RLS به‌تنهایی ruleهای دامنهٔ حسابداری را enforce نمی‌کند. مثلاً RLS می‌گوید چه کسی می‌تواند insert کند، اما نمی‌گوید مبلغ منفی نباشد یا جمع دو طرف برابر باشد. همچنین policy فعلی اجازهٔ delete سند draft را می‌دهد و برای سند posted تفاوتی قائل نیست. این مسئله باید با status-aware policy یا commandهای دیتابیسی اصلاح شود.

## تحلیل middleware احراز هویت

`requireSupabaseAuth` هدر Bearer را از request می‌گیرد، client سمت سرور را با publishable key می‌سازد و `getClaims(token)` را اجرا می‌کند. سپس `userId` و claims در context قرار می‌گیرند. این طراحی از ارسال service-role key به client جلوگیری می‌کند و برای server functionهای معمولی مناسب است.

چند نکتهٔ عملی باید کنترل شود:

1. احراز هویت middleware باید با policyهای RLS هم‌راستا بماند؛ صرفاً داشتن token به معنی مجازبودن عملیات مالی نیست.
2. خطای احراز هویت نباید به خطای 500 عمومی تبدیل شود؛ باید پاسخ 401/403 قابل تشخیص داشته باشد.
3. در server functionهای مالی، actor باید همیشه از `context.userId` یا `auth.uid()` گرفته شود و هرگز از input کلاینت پذیرفته نشود.
4. service-role client نباید در moduleهایی import شود که به bundle کلاینت راه پیدا می‌کنند.
5. تغییر نقش، مشاهدهٔ audit و عملیات posted باید یک authorization مستقل از middleware پایه داشته باشد.

## تحلیل مسیر ثبت فعلی

در `src/lib/accounting.functions.ts`، ابتدا مجموع debit و credit در JavaScript محاسبه می‌شود. سپس header در `journal_entries` درج و بعد خطوط در `journal_lines` درج می‌شوند. اگر درج lines شکست بخورد، حذف header به‌صورت جبرانی اجرا می‌شود.

این مسیر سه مشکل دارد. اول، دو درخواست مستقل به PostgREST transaction مشترک ندارند. دوم، محاسبهٔ money با `Number` برای مقادیر مالی در مقیاس بزرگ یا roundingهای حساس قابل اتکا نیست. سوم، تابع input validator فقط TypeScript annotation است و schema runtime تولید نمی‌کند.

الگوی امن‌تر این است که server function فقط ورودی را به یک RPC بدهد و تمام validation، درج و audit در یک transaction دیتابیس انجام شود. محاسبات مبلغ باید با `NUMERIC` و policy مشخص rounding انجام شوند.

## کمبودهای تمامیت داده

در schema فعلی این constraintها دیده نمی‌شوند:

- `debit >= 0` و `credit >= 0`
- عدم مثبت‌بودن هم‌زمان debit و credit
- حداقل دو line برای هر entry
- تراز بودن مجموع debit و credit
- status محدود به مقادیر مجاز
- مرجع مالک معتبر با Foreign Key
- ممنوعیت تغییر مستقیم entry دارای status قطعی
- دقت و واحد پول مشخص
- idempotency برای retry درخواست

برخی از این موارد با CHECK ساده حل نمی‌شوند؛ برای تراز کل و حداقل تعداد خطوط باید از RPC، trigger کنترل‌شده یا فرآیند posting استفاده شود. policy نباید جایگزین domain validation شود.

## مشکل تراکنش و rollback جبرانی

rollback جبرانی با delete، تراکنش واقعی نیست. نمونه‌های شکست ممکن است شامل قطع شبکه بین درج header و درج lines، timeout در delete، خطای policy در delete یا retry هم‌زمان درخواست باشند. در این حالت دادهٔ نیمه‌کاره یا duplicate ایجاد می‌شود.

راه‌حل پیشنهادی، function دیتابیس با یک call است. PostgreSQL هر statement function را در transaction call اجرا می‌کند؛ اگر exception رخ دهد، تغییرات همان call rollback می‌شوند. برای جلوگیری از race condition باید انتقال وضعیت با شرط status و version انجام شود.

## مدل پیشنهادی migrationها

Migrationهای آینده بهتر است به بخش‌های کوچک و قابل rollback تقسیم شوند:

1. `journal_integrity`: enum/checkها، Foreign Keyها، indexها و ستون‌های cycle.
2. `audit_events`: جدول append-only، policy و helper امن.
3. `journal_commands`: RPCهای create، submit، approve، post و reverse.
4. `rls_status_controls`: محدودکردن update/delete مستقیم بر اساس status.
5. `backfill_legacy_entries`: مقداردهی actor و status برای دادهٔ موجود.
6. `generated_types`: بازتولید `src/integrations/supabase/types.ts`.

Migration قبلی را بازنویسی نکنید؛ هر تغییر schema باید migration جدید با نام و هدف روشن داشته باشد. بعد از هر migration، schema diff و تست RLS اجرا شود.

## پیشنهاد policy جدید

policyهای فعلی مالک‌محور هستند. برای lifecycle بهتر است update عمومی محدود شود و commandها مسئول انتقال باشند. نمونهٔ مفهومی:

```sql
CREATE POLICY "draft owner can update"
ON public.journal_entries
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND status IN ('draft', 'returned')
  AND public.can_edit(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  AND status IN ('draft', 'returned')
);
```

برای `submitted`، `approved`، `posted` و `locked` به‌جای اجازهٔ update عمومی، functionهای مشخص با transition معتبر ایجاد کنید. این policy فقط الگوست و باید با enum و business role واقعی پروژه هماهنگ شود.

## تحلیل نقش‌ها و حداقل دسترسی

نقش‌های فعلی `viewer`، `editor` و `admin` برای شروع ساده‌اند، اما نقش با permission یکسان نیست. برای حسابداری بهتر است permissionهای دامنه‌ای مثل `journal.create`، `journal.submit`، `journal.approve`، `journal.post`، `journal.reverse` و `audit.read` تعریف شوند.

تابع‌های `has_role` و `can_edit` باید از نظر recursion و privilege بررسی شوند. چون این تابع‌ها داخل policy فراخوانی می‌شوند، باید `search_path` محدود داشته باشند و در برابر تغییر نقش یا دورزدن policy مقاوم باشند. تغییر نقش باید فقط برای admin مجاز باشد و در audit ثبت شود.

## کنترل‌های ضروری قبل از production

قبل از انتشار عملی، این کنترل‌ها باید به‌صورت خودکار در CI اجرا شوند:

- migration از ابتدا روی یک database خالی اجرا شود.
- schema پس از migration با types تولیدشده مقایسه شود.
- تست RLS برای anonymous، viewer، editor و admin اجرا شود.
- create entry، retry و duplicate number تست شوند.
- شکست درج line و rollback بررسی شود.
- انتقال status با version قدیمی رد شود.
- posted update/delete از API و RPC عمومی رد شود.
- audit event برای تمام commandهای حساس وجود داشته باشد.
- lint و build در CI موفق باشند.
- dependency install با package manager مشخص پروژه بازتولیدپذیر باشد.

## References

[1]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security"
[2]: https://supabase.com/docs/guides/database/functions "Supabase Database Functions"
[3]: https://supabase.com/docs/guides/database/postgres/grant-table-access "Supabase Grant Table Access"
[4]: https://www.postgresql.org/docs/current/ddl-constraints.html "PostgreSQL Constraints"
[5]: https://www.postgresql.org/docs/current/transaction-iso.html "PostgreSQL Transaction Isolation"
[6]: https://supabase.com/docs/guides/api/rest/json-data "Supabase JSON and PostgREST Data"

_نویسنده: Manus AI_
