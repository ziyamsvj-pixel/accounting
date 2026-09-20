import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JournalLine = {
  id: string;
  entry_id: string;
  account_id: string | null;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string | null;
};

export type JournalEntry = {
  id: string;
  user_id: string;
  created_by: string;
  entry_date: string;
  entry_date_fa: string | null;
  document_number: string;
  description: string | null;
  status: string;
  version: number;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
  returned_at: string | null;
  returned_by: string | null;
  return_reason: string | null;
  created_at: string;
};

export type EntryWithLines = JournalEntry & { journal_lines: JournalLine[] };

export type LineInput = {
  account_id?: string | null;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description?: string | null;
};

export type TransitionTarget =
  "submitted" | "returned" | "approved" | "posted" | "locked" | "reversed";

const lineSchema = z.object({
  account_id: z.string().uuid().nullable().optional(),
  account_code: z.string().trim().min(1).max(64),
  account_name: z.string().trim().min(1).max(200),
  debit: z.number().finite().min(0),
  credit: z.number().finite().min(0),
  description: z.string().max(1000).nullable().optional(),
});

const createEntrySchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entry_date_fa: z.string().max(32).nullable().optional(),
  document_number: z.string().trim().min(1).max(64),
  description: z.string().max(2000).nullable().optional(),
  lines: z.array(lineSchema).min(2),
});

const transitionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  target: z.enum(["submitted", "returned", "approved", "posted", "locked", "reversed"]),
  reason: z.string().max(1000).nullable().optional(),
});

const ENTRY_COLS =
  "id, user_id, created_by, entry_date, entry_date_fa, document_number, description, status, version, submitted_at, submitted_by, approved_at, approved_by, posted_at, posted_by, locked_at, locked_by, returned_at, returned_by, return_reason, created_at";
const LINE_COLS =
  "id, entry_id, account_id, account_code, account_name, debit, credit, description";

function asEntry(value: unknown): JournalEntry {
  return value as JournalEntry;
}

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
  .validator(z.object({ id: z.string().uuid() }))
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
  .validator(createEntrySchema)
  .handler(async ({ data, context }) => {
    const { data: entryId, error } = await context.supabase.rpc("create_journal_entry", {
      p_description: data.description ?? null,
      p_document_number: data.document_number,
      p_entry_date: data.entry_date,
      p_entry_date_fa: data.entry_date_fa ?? null,
      p_lines: data.lines,
    });

    if (error || !entryId) {
      return { id: null, error: error?.message ?? "ثبت پیش‌نویس سند ممکن نشد." };
    }
    return { id: entryId as string, error: null as string | null };
  });

export const transitionEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(transitionSchema)
  .handler(async ({ data, context }) => {
    const reason = data.reason ?? null;
    const rpcArgs = { p_entry_id: data.id, p_expected_version: data.version };
    const result =
      data.target === "submitted"
        ? await context.supabase.rpc("submit_journal_entry", rpcArgs)
        : data.target === "returned"
          ? await context.supabase.rpc("return_journal_entry", { ...rpcArgs, p_reason: reason })
          : data.target === "approved"
            ? await context.supabase.rpc("approve_journal_entry", rpcArgs)
            : data.target === "posted"
              ? await context.supabase.rpc("post_journal_entry", rpcArgs)
              : data.target === "locked"
                ? await context.supabase.rpc("lock_journal_entry", rpcArgs)
                : await context.supabase.rpc("reverse_journal_entry", {
                    ...rpcArgs,
                    p_reason: reason,
                  });

    if (result.error || !result.data) {
      return { entry: null, error: result.error?.message ?? "تغییر وضعیت سند ممکن نشد." };
    }
    return { entry: asEntry(result.data), error: null as string | null };
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
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
