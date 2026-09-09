const SEVERITY: Record<string, { label: string; className: string }> = {
  informational: { label: "اطلاع‌رسانی", className: "bg-muted text-muted-foreground" },
  warning: { label: "هشدار", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  blocking: { label: "بازدارنده", className: "bg-destructive/15 text-destructive" },
};

const STATUS: Record<string, string> = {
  draft: "پیش‌نویس",
  reviewed: "بازبینی‌شده",
  approved: "تأییدشده",
  active: "فعال",
  superseded: "جایگزین‌شده",
  retired: "بازنشسته",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY[severity] ?? {
    label: severity,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
      {STATUS[status] ?? status}
    </span>
  );
}
