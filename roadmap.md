# Roadmap

- [x] ویرایش سطرهای اسناد قدیمی (معین/تفصیلی ۱ و ۲) — صفحهٔ edit + تابع updateEntryLines + دکمه در جزئیات سند
- [x] قابلیت AI: تولید سند حسابداری متوازن از شرح آزاد رویداد مالی — آزمون واقعی موفق (سند متوازن ۲ سطره با حساب‌های شناخته‌شده)
- [ ] رفع دو هشدار security linter دربارهٔ توابع SECURITY DEFINER (has_role، can_edit)
- [ ] آزمون مسیرهای محافظت‌شده پس از ساخت اولین حساب کاربری
- [x] F0: Domain و invariantهای قطعی (مبلغ دقیق، ارز، دوره، حساب، توازن) + تست
- [x] F1: Workflow سند (Draft/Submit/Approve/Post/Reversal)، Idempotency، Optimistic Lock، Outbox + تست
- [x] Runtime ایجنت‌ها با اخطار غیرمسدودکننده + تست
- [x] کنترل توازن دقیق و حفاظت از سند posted در برنامهٔ فعلی
- [ ] تصمیم‌های مدیریت (D-007)
- [ ] F2: Migration، RLS چندسازمانی، Backup/Restore (نیازمند تأیید صریح)
- [ ] F3: جدول‌های ارز و تسعیر
- [ ] F4: Reconciliation زمان‌بندی‌شده و API
- [ ] F5: فروش، خرید، انبار و Compliance
