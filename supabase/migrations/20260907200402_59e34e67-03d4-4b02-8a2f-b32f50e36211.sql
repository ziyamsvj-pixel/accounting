CREATE TABLE public.regulatory_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority text NOT NULL,
  document_type text NOT NULL,
  document_number text,
  title text NOT NULL,
  issue_date date,
  effective_date date,
  official_reference text,
  verification_status text NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  domain text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'informational',
  status text NOT NULL DEFAULT 'draft',
  effective_from date,
  effective_to date,
  priority int NOT NULL DEFAULT 100,
  explanation text NOT NULL,
  education_note text,
  source_id uuid REFERENCES public.regulatory_sources(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_code, version)
);

CREATE TABLE public.allocation_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  basis_key text NOT NULL UNIQUE,
  title_fa text NOT NULL,
  description text NOT NULL,
  sort_order int NOT NULL DEFAULT 100
);

GRANT SELECT ON public.regulatory_sources TO anon, authenticated;
GRANT SELECT ON public.compliance_rules TO anon, authenticated;
GRANT SELECT ON public.allocation_bases TO anon, authenticated;
GRANT ALL ON public.regulatory_sources TO service_role;
GRANT ALL ON public.compliance_rules TO service_role;
GRANT ALL ON public.allocation_bases TO service_role;

ALTER TABLE public.regulatory_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocation_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulatory_sources public read" ON public.regulatory_sources FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "compliance_rules public read" ON public.compliance_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "allocation_bases public read" ON public.allocation_bases FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.allocation_bases (basis_key, title_fa, description, sort_order) VALUES
  ('revenue_ratio', 'نسبت درآمد', 'تسهیم هزینهٔ مشترک بر پایهٔ سهم هر فعالیت از کل درآمد دوره.', 10),
  ('area_ratio', 'نسبت متراژ', 'تسهیم بر پایهٔ متراژ فضای مورد استفادهٔ هر فعالیت.', 20),
  ('headcount', 'تعداد نیروی انسانی', 'تسهیم بر پایهٔ تعداد کارکنان تخصیص‌یافته به هر فعالیت.', 30),
  ('actual_consumption', 'مصرف واقعی', 'تسهیم بر پایهٔ مصرف اندازه‌گیری‌شده (انرژی، ساعت ماشین و مانند آن).', 40),
  ('cost_center', 'مرکز هزینه', 'تسهیم بر پایهٔ مراکز هزینهٔ تعریف‌شده در ساختار سازمان.', 50),
  ('project', 'پروژه', 'تسهیم بر پایهٔ سهم هر پروژه از فعالیت دوره.', 60),
  ('custom', 'مبنای اختصاصی مستند', 'مبنای تعریف‌شده توسط شرکت که باید مستند و قابل دفاع باشد.', 70);

INSERT INTO public.regulatory_sources (id, authority, document_type, document_number, title, issue_date, effective_date, official_reference, verification_status) VALUES
  ('11111111-1111-4111-8111-111111111111', 'سازمان امور مالیاتی کشور', 'قانون', 'ق.م.م', 'قانون مالیات‌های مستقیم — مواد مربوط به هزینه‌های قابل قبول', NULL, NULL, 'مواد ۱۴۷ و ۱۴۸ قانون مالیات‌های مستقیم', 'unverified'),
  ('22222222-2222-4222-8222-222222222222', 'سازمان امور مالیاتی کشور', 'قانون', 'ق.م.ا.ا', 'قانون دائمی مالیات بر ارزش افزوده', NULL, NULL, 'قانون مالیات بر ارزش افزوده مصوب ۱۴۰۰', 'unverified'),
  ('33333333-3333-4333-8333-333333333333', 'سازمان امور مالیاتی کشور', 'قانون', 'پایانه‌ها', 'قانون پایانه‌های فروشگاهی و سامانه مؤدیان', NULL, NULL, 'قانون پایانه‌های فروشگاهی و سامانه مؤدیان', 'unverified'),
  ('44444444-4444-4444-8444-444444444444', 'سازمان حسابرسی', 'استاندارد', 'ح-۱', 'استانداردهای حسابداری ایران — نحوهٔ ارائه صورت‌های مالی', NULL, NULL, 'استاندارد حسابداری شمارهٔ ۱', 'unverified');

INSERT INTO public.compliance_rules (rule_code, version, domain, title, severity, status, priority, explanation, education_note, source_id) VALUES
  ('DT-EXP-001', '1.0.0', 'مالیات مستقیم', 'هزینهٔ مشترک بین فعالیت معاف و مشمول باید تسهیم شود', 'warning', 'draft', 10, 'هرگاه یک هزینه به فعالیت‌هایی با وضعیت مالیاتی متفاوت مربوط باشد، باید بر مبنایی مستند تسهیم شود و مبنا و مستندات آن ثبت گردد.', 'این هزینه به فعالیت‌هایی با وضعیت مالیاتی متفاوت مرتبط است. مبنای تسهیم را مشخص کنید.', '11111111-1111-4111-8111-111111111111'),
  ('DT-EXP-002', '1.0.0', 'مالیات مستقیم', 'هزینهٔ فاقد مدرک مثبته قابل قبول نیست', 'warning', 'draft', 20, 'هزینه‌ای که مدرک مثبتهٔ معتبر ندارد در محاسبهٔ درآمد مشمول مالیات پذیرفته نمی‌شود و باید در تطبیق مالیاتی برگشت داده شود.', 'برای این هزینه مدرک مثبته پیوست نشده است. سند پشتیبان را بارگذاری یا دلیل آن را ثبت کنید.', '11111111-1111-4111-8111-111111111111'),
  ('VAT-001', '1.0.0', 'ارزش افزوده', 'اعتبار مالیاتی خرید مرتبط با فروش معاف قابل کسر نیست', 'warning', 'draft', 10, 'مالیات ارزش افزودهٔ خریدهایی که به فروش معاف مربوط می‌شود قابل کسر نیست و در صورت مشترک بودن، باید تسهیم شود.', 'بخشی از خرید شما به فروش معاف مربوط است؛ اعتبار مالیاتی آن باید تسهیم شود.', '22222222-2222-4222-8222-222222222222'),
  ('VAT-002', '1.0.0', 'ارزش افزوده', 'نرخ ارزش افزوده باید با تاریخ اثر معامله سنجیده شود', 'informational', 'draft', 30, 'ارزیابی نرخ باید بر اساس نرخ معتبر در تاریخ تحقق معامله انجام شود، نه نرخ جاری.', 'نرخ اعمال‌شده بر مبنای تاریخ سند محاسبه می‌شود.', '22222222-2222-4222-8222-222222222222'),
  ('MOD-001', '1.0.0', 'سامانه مؤدیان', 'صورتحساب الکترونیکی باید در مهلت مقرر ارسال شود', 'warning', 'draft', 10, 'صورتحساب‌های مشمول باید در مهلت تعیین‌شده به سامانه مؤدیان ارسال و شناسهٔ یکتا دریافت کنند.', 'این صورتحساب هنوز به سامانه مؤدیان ارسال نشده است.', '33333333-3333-4333-8333-333333333333'),
  ('MOD-002', '1.0.0', 'سامانه مؤدیان', 'شناسهٔ یکتای حافظه مالیاتی باید در سند ثبت شود', 'informational', 'draft', 40, 'برای پیگیری و تطبیق، شناسهٔ یکتای دریافتی از سامانه باید به سند حسابداری متصل شود.', 'شناسهٔ یکتای سامانه را به سند متصل کنید تا تطبیق آسان شود.', '33333333-3333-4333-8333-333333333333'),
  ('WHT-001', '1.0.0', 'کسر تکلیفی', 'کسر مالیات تکلیفی در پرداخت‌های مشمول', 'warning', 'draft', 20, 'در پرداخت‌های مشمول کسر تکلیفی، مبلغ کسرشده باید در همان سند شناسایی و در موعد مقرر پرداخت شود.', 'برای این پرداخت، کسر مالیات تکلیفی بررسی نشده است.', '11111111-1111-4111-8111-111111111111'),
  ('ACC-001', '1.0.0', 'استانداردهای حسابداری', 'تعادل بدهکار و بستانکار در هر سند', 'blocking', 'draft', 1, 'مجموع بدهکار و بستانکار هر سند حسابداری باید برابر باشد؛ در غیر این صورت سند قابل ثبت نیست.', 'سند شما تراز نیست؛ اختلاف بدهکار و بستانکار را برطرف کنید.', '44444444-4444-4444-8444-444444444444'),
  ('ACC-002', '1.0.0', 'استانداردهای حسابداری', 'شناسایی هزینه در دورهٔ تحقق', 'informational', 'draft', 50, 'هزینه باید در دوره‌ای شناسایی شود که منفعت آن مصرف شده است، نه صرفاً در زمان پرداخت.', 'تاریخ سند با دورهٔ تحقق هزینه هم‌خوان نیست.', '44444444-4444-4444-8444-444444444444'),
  ('AUD-001', '1.0.0', 'کنترل‌های حسابرسی', 'تفکیک وظایف ثبت، تأیید و ثبت نهایی', 'warning', 'draft', 30, 'ایجادکننده، تأییدکننده و ثبت‌کنندهٔ نهایی سند نباید یک نفر باشند.', 'یک کاربر هر سه مرحله را انجام داده است؛ تفکیک وظایف رعایت نشده.', '44444444-4444-4444-8444-444444444444');