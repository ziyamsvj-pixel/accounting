import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "خانه" },
  { to: "/rules", label: "قواعد انطباق" },
  { to: "/sources", label: "منابع مقرراتی" },
  { to: "/allocation", label: "تخصیص هزینه" },
] as const;

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" lang="fa" className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              ح
            </span>
            <span className="text-sm font-semibold">هستهٔ حسابداری</span>
          </Link>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-t border-border/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-6 text-xs leading-6 text-muted-foreground">
          هیچ قاعده‌ای پیش از تأیید منبع رسمی آن فعال نمی‌شود. تصمیم‌های گذشته همیشه نسخهٔ قاعدهٔ
          زمان ثبت را نگه می‌دارند.
        </div>
      </footer>
    </div>
  );
}

export function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="pb-8">
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      {lead ? (
        <p className="mt-3 max-w-3xl text-sm leading-8 text-muted-foreground">{lead}</p>
      ) : null}
    </div>
  );
}
