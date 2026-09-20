import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JournalLine = {
  id: string;
  entry_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string | null;
};

export type JournalEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  entry_date_fa: string | null;
  document_number: string;
  description: string | null;
  status: string;
  created_at: string;
};

export type EntryWithLines = JournalEntry & { journal_lines: JournalLine[] };

export type LineInput = {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description?: string | null;
};

const ENTRY_COLS =
  "id, user_id, entry_date, entry_date_fa, document_number, description, status, created_at";
const LINE_COLS = "id, entry_id, account_code, account_name, debit, credit, description";

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    const list = (roles ?? []).map((r: { role: string }) => r.role);
    return {
      userId,
      fullName: (profile?.full_name as string | null) ?? null,
      roles: list,
      canEdit: list.includes("editor") || list.includes("admin"),
      isAdmin: list.includes("admin"),
    };
  });

export const listEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("journal_entries")
      .select(`${ENTRY_COLS}, journal_lines(${LINE_COLS})`)
      .order("entry_date", { ascending: false });
    if (error) return { entries: [] as EntryWithLines[], error: error.message };
    return { entries: (data ?? []) as unknown as EntryWithLines[], error: null as string | null };
  });

export const getEntry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("journal_entries")
      .select(`${ENTRY_COLS}, journal_lines(${LINE_COLS})`)
      .eq("id", data.id)
      .maybeSingle();
    if (error) return { entry: null, error: error.message };
    return { entry: (row as unknown as EntryWithLines) ?? null, error: null as string | null };
  });

export const createEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      entry_date: string;
      entry_date_fa?: string | null;
      document_number: string;
      description?: string | null;
      status: string;
      lines: LineInput[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const totalDebit = data.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (data.lines.length < 2) {
      return { id: null, error: "هر سند باید دست‌کم دو سطر داشته باشد." };
    }
    if (Math.round((totalDebit - totalCredit) * 100) !== 0) {
      return { id: null, error: "جمع بدهکار و بستانکار سند برابر نیست." };
    }

    const { data: entry, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        entry_date: data.entry_date,
        entry_date_fa: data.entry_date_fa ?? null,
        document_number: data.document_number,
        description: data.description ?? null,
        status: data.status,
      })
      .select("id")
      .single();
    if (error || !entry) return { id: null, error: error?.message ?? "ثبت سند ممکن نشد." };

    const { error: lineError } = await supabase.from("journal_lines").insert(
      data.lines.map((l) => ({
        entry_id: entry.id,
        account_code: l.account_code,
        account_name: l.account_name,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description ?? null,
      })),
    );
    if (lineError) {
      await supabase.from("journal_entries").delete().eq("id", entry.id);
      return { id: null, error: lineError.message };
    }

    return { id: entry.id as string, error: null as string | null };
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("journal_entries").delete().eq("id", data.id);
    return { error: error?.message ?? null };
  });

export const accessQuery = queryOptions({
  queryKey: ["my-access"],
  queryFn: () => getMyAccess(),
});

export const entriesQuery = queryOptions({
  queryKey: ["journal-entries"],
  queryFn: () => listEntries(),
});

export const entryQuery = (id: string) =>
  queryOptions({
    queryKey: ["journal-entry", id],
    queryFn: () => getEntry({ data: { id } }),
  });
