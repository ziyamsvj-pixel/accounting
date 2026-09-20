import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/", label: "خانه" },
  { to: "/rules", label: "قواعد انطباق" },
  { to: "/sources", label: "منابع مقرراتی" },
  { to: "/allocation", label: "تخصیص هزینه" },
  { to: "/documents", label: "اسناد حسابداری" },
  { to: "/ledger", label: "دفتر کل" },
] as const;

function AuthNav() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!email) {
    return (
      <Link
        to="/auth"
        className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
      >
        ورود / ثبت‌نام
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/" });
        }}
        className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
      >
        خروج
      </button>
    </div>
  );
}

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
          <AuthNav />
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
