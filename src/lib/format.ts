export function formatAmount(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(n);
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}
