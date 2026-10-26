import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { SiteLayout, PageHeader } from "@/components/site-layout";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ورود و ثبت‌نام — هستهٔ حسابداری" },
      {
        name: "description",
        content:
          "ورود کاربران هستهٔ حسابداری برای ثبت اسناد، مشاهدهٔ دفتر کل و بررسی انطباق با قواعد مقرراتی.",
      },
      { property: "og:title", content: "ورود و ثبت‌نام — هستهٔ حسابداری" },
      { property: "og:description", content: "دسترسی به اسناد حسابداری و دفتر کل شخصی شما." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/documents", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (err) throw err;
        if (data.session) {
          navigate({ to: "/documents", replace: true });
        } else {
          setMessage("حساب ساخته شد. برای فعال‌سازی، پیوند تأیید ارسال‌شده به ایمیل خود را باز کنید.");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate({ to: "/documents", replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "عملیات ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout>
      <PageHeader
        title={mode === "signin" ? "ورود کاربران" : "ثبت‌نام"}
        lead="برای ثبت اسناد حسابداری، دیدن دفتر کل و اجرای بررسی انطباق باید وارد شوید. هر کاربر تنها اسناد خودش را می‌بیند."
      />

      <form
        onSubmit={onSubmit}
        className="max-w-md space-y-4 rounded-lg border border-border bg-card p-6"
      >
        {mode === "signup" ? (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">نام و نام خانوادگی</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">ایمیل</label>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">گذرواژه</label>
          <input
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          />
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "لطفاً صبر کنید…" : mode === "signin" ? "ورود" : "ساخت حساب"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
          }}
          className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "حساب ندارید؟ ثبت‌نام کنید" : "حساب دارید؟ وارد شوید"}
        </button>
      </form>
    </SiteLayout>
  );
}
