import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteLayout } from "@/components/site-layout";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "هستهٔ حسابداری — انطباق و مقررات" },
      {
        name: "description",
        content:
          "چارچوب انطباق مالیاتی و حسابرسی هستهٔ حسابداری: قواعد نسخه‌دار، منابع مرجع، تخصیص هزینه و نقشهٔ راه اجرا.",
      },
      { property: "og:title", content: "هستهٔ حسابداری — انطباق و مقررات" },
      {
        property: "og:description",
        content:
          "قواعد نسخه‌دار با منبع رسمی، ارزیابی بر پایهٔ تاریخ اثر، آموزش کاربر و رد پای حسابرسی.",
      },
    ],
  }),
  component: Index,
});

const pipeline = [
  "تراکنش",
  "طبقه‌بندی",
  "قواعد مرتبط",
  "ارزیابی",
  "هشدار و آموزش",
  "تصمیم کاربر",
  "ثبت حسابرسی",
];

const contexts = [
  "استانداردهای حسابداری",
  "کنترل‌های حسابرسی",
  "مالیات مستقیم",
  "ارزش افزوده",
  "سامانه مؤدیان",
  "کسر تکلیفی",
  "منابع مقرراتی",
];

const severities = [
  {
    title: "اطلاع‌رسانی",
    body: "فقط آگاه‌سازی؛ جلوی ثبت سند را نمی‌گیرد.",
  },
  {
    title: "هشدار",
    body: "نیاز به توجه کاربر دارد و تصمیم او ثبت می‌شود.",
  },
  {
    title: "بازدارنده",
    body: "تنها زمانی مجاز است که الزام قانونی آن با منبع تأییدشده احراز شود.",
  },
];

const lifecycle = [
  "پیش‌نویس",
  "بازبینی‌شده",
  "تأییدشده",
  "فعال",
  "جایگزین‌شده",
  "بازنشسته",
];

const allocationBases = [
  "نسبت درآمد",
  "نسبت متراژ",
  "تعداد نیروی انسانی",
  "مصرف واقعی",
  "مرکز هزینه",
  "پروژه",
  "مبنای اختصاصی مستند",
];

const roadmap = [
  {
    phase: "P0",
    body: "قراردادهای پایه، مدل قاعده/نسخه/منبع، ارزیابی بر اساس تاریخ اثر، اتصال به حسابرسی و بستر تست قواعد.",
  },
  {
    phase: "P1",
    body: "موتور تخصیص هزینه، طبقه‌بندی مالیاتی، بسته‌های قواعد ارزش افزوده و مؤدیان، کاتالوگ آموزش و گردش‌کار تغییر مقررات.",
  },
  {
    phase: "P2",
    body: "شاخص‌های ریسک حسابرسی، مقایسهٔ نسخه‌های مقررات و کمک به تدوین قاعده با تأیید انسانی.",
  },
];

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border/60 py-12">
      <h2 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h2>
      {subtitle ? (
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{subtitle}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Index() {
  return (
    <SiteLayout>
      <div className="w-full">
        <header className="pb-10">
          <p className="text-xs font-medium tracking-widest text-muted-foreground">
            ACCOUNTING CORE
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            هستهٔ حسابداری — انطباق و هوش مقرراتی
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-muted-foreground sm:text-base">
            مقررات جدا از اصول ثابت حسابداری نگهداری و نسخه‌گذاری می‌شوند. هر قاعدهٔ فعال باید
            منبع رسمی تأییدشده، بازهٔ اعتبار و پوشش تست داشته باشد. آموزش کاربر و قابلیت
            حسابرسی، از همان ابتدا بخشی از طراحی‌اند.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["نسخه‌دار", "منبع‌محور", "قابل حسابرسی", "چندشرکتی"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/rules"
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              مشاهدهٔ قواعد انطباق
            </Link>
            <Link
              to="/allocation"
              className="rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
            >
              ماشین‌حساب تخصیص هزینه
            </Link>
          </div>
        </header>

        <Section
          title="مسیر ارزیابی"
          subtitle="هر تراکنش از این زنجیره عبور می‌کند و نتیجهٔ آن همراه با نسخهٔ قاعده ثبت می‌شود."
        >
          <ol className="flex flex-wrap items-center gap-2">
            {pipeline.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                  {step}
                </span>
                {i < pipeline.length - 1 ? (
                  <span className="text-muted-foreground">←</span>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>

        <Section title="حوزه‌های تخصصی" subtitle="مرزبندی دامنه‌ها برای جلوگیری از درهم‌آمیختن قواعد.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {contexts.map((c) => (
              <div key={c} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                {c}
              </div>
            ))}
          </div>
        </Section>

        <Section title="سطح شدت قواعد">
          <div className="grid gap-4 sm:grid-cols-3">
            {severities.map((s) => (
              <div key={s.title} className="rounded-lg border border-border bg-card p-5">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="چرخهٔ عمر قاعده"
          subtitle="تصمیم‌های گذشته همیشه نسخه‌ای از قاعده را نگه می‌دارند که در زمان ثبت اعمال شده است."
        >
          <div className="flex flex-wrap gap-2">
            {lifecycle.map((s, i) => (
              <span
                key={s}
                className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
              >
                {i + 1}. {s}
              </span>
            ))}
          </div>
        </Section>

        <Section
          title="تخصیص هزینه‌های مشترک"
          subtitle="هزینهٔ ناخالص، مبنا، درصدها، مبالغ، کاربر مسئول، مستندات و نسخهٔ قاعده ذخیره می‌شود."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allocationBases.map((b) => (
              <div key={b} className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                {b}
              </div>
            ))}
          </div>
        </Section>

        <Section title="نقشهٔ راه اجرا">
          <div className="space-y-3">
            {roadmap.map((r) => (
              <div
                key={r.phase}
                className="rounded-lg border border-border bg-card p-5 sm:flex sm:gap-5"
              >
                <span className="text-sm font-bold text-primary">{r.phase}</span>
                <p className="mt-2 text-sm leading-7 text-muted-foreground sm:mt-0">{r.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <footer className="border-t border-border/60 pt-8 text-xs leading-6 text-muted-foreground">
          مستندات کامل در پوشهٔ <code className="font-mono">docs/compliance</code> و گزارش بازبینی
          در <code className="font-mono">docs/reviews</code> قرار دارد. هیچ قاعده‌ای پیش از تأیید
          منبع رسمی آن فعال نمی‌شود.
        </footer>
      </div>
    </SiteLayout>
  );
}
