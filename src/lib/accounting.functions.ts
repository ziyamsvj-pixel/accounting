import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkPostedLineEnrichment, isPostedStatus, validateLegacyLines } from "@/lib/legacy-journal-guard";

export type JournalLine = {
  id: string;
  entry_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string | null;
  subsidiary_code?: string | null;
  subsidiary_name?: string | null;
  detail1_code?: string | null;
  detail1_name?: string | null;
  detail2_code?: string | null;
  detail2_name?: string | null;
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
  subsidiary_code?: string | null;
  subsidiary_name?: string | null;
  detail1_code?: string | null;
  detail1_name?: string | null;
  detail2_code?: string | null;
  detail2_name?: string | null;
};

const ENTRY_COLS =
  "id, user_id, entry_date, entry_date_fa, document_number, description, status, created_at";
const LINE_COLS = "id, entry_id, account_code, account_name, debit, credit, description, subsidiary_code, subsidiary_name, detail1_code, detail1_name, detail2_code, detail2_name";

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

    // کنترل قطعی با مبلغ دقیق (bigint)، نه جمع اعشاری جاوااسکریپت.
    const invalid = validateLegacyLines(data.lines);
    if (invalid) return { id: null, error: invalid };

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
        subsidiary_code: l.subsidiary_code || null,
        subsidiary_name: l.subsidiary_name || null,
        detail1_code: l.detail1_code || null,
        detail1_name: l.detail1_name || null,
        detail2_code: l.detail2_code || null,
        detail2_name: l.detail2_name || null,
      })),
    );
    if (lineError) {
      await supabase.from("journal_entries").delete().eq("id", entry.id);
      return { id: null, error: lineError.message };
    }

    return { id: entry.id as string, error: null as string | null };
  });

export const generateEntryDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { description: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const description = data.description?.trim();
    if (!description || description.length < 10) {
      return { draft: null, error: "شرح رویداد مالی را کمی کامل‌تر بنویسید (دست‌کم ۱۰ نویسه)." };
    }

    // حساب‌هایی که کاربر قبلاً در اسناد خودش استفاده کرده (برای پیشنهاد دقیق‌تر)
    const { data: myLines } = await supabase
      .from("journal_lines")
      .select(
        "account_code, account_name, subsidiary_code, subsidiary_name, detail1_code, detail1_name, detail2_code, detail2_name, journal_entries!inner(user_id)",
      )
      .eq("journal_entries.user_id", userId)
      .limit(200);

    const seen = new Set<string>();
    const knownAccounts = (myLines ?? [])
      .filter((l) => {
        const key = [l.account_code, l.subsidiary_code, l.detail1_code, l.detail2_code].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((l) => ({
        account_code: l.account_code,
        account_name: l.account_name,
        subsidiary_code: l.subsidiary_code,
        subsidiary_name: l.subsidiary_name,
        detail1_code: l.detail1_code,
        detail1_name: l.detail1_name,
        detail2_code: l.detail2_code,
        detail2_name: l.detail2_name,
      }));

    const { generateJournalDraft } = await import("@/lib/ai/journal-draft.server");
    return generateJournalDraft(description, knownAccounts);
  });

export const updateEntryLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      entryId: string;
      lines: {
        id: string;
        account_code: string;
        account_name: string;
        subsidiary_code?: string | null;
        subsidiary_name?: string | null;
        detail1_code?: string | null;
        detail1_name?: string | null;
        detail2_code?: string | null;
        detail2_name?: string | null;
      }[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: entry, error: entryError } = await supabase
      .from("journal_entries")
      .select(`status, journal_lines(${LINE_COLS})`)
      .eq("id", data.entryId)
      .maybeSingle();
    if (entryError) return { error: entryError.message };
    if (!entry) return { error: "سند یافت نشد." };
    if (isPostedStatus(entry.status as string)) {
      // سند Posted: فقط تکمیل معین/تفصیلی خالی (اصل «سند Posted قابل ویرایش مستقیم نیست»).
      const currentLines = (entry.journal_lines ?? []) as unknown as JournalLine[];
      for (const line of data.lines) {
        const current = currentLines.find((l) => l.id === line.id);
        if (!current) return { error: "سطر موردنظر در این سند یافت نشد." };
        const blocked = checkPostedLineEnrichment(current, line);
        if (blocked) return { error: blocked };
      }
    }
    for (const line of data.lines) {
      const { error } = await supabase
        .from("journal_lines")
        .update({
          account_code: line.account_code,
          account_name: line.account_name,
          subsidiary_code: line.subsidiary_code || null,
          subsidiary_name: line.subsidiary_name || null,
          detail1_code: line.detail1_code || null,
          detail1_name: line.detail1_name || null,
          detail2_code: line.detail2_code || null,
          detail2_name: line.detail2_name || null,
        })
        .eq("id", line.id)
        .eq("entry_id", data.entryId);
      if (error) return { error: error.message };
    }
    return { error: null as string | null };
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: entry, error: readError } = await context.supabase
      .from("journal_entries")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) return { error: readError.message };
    if (entry && isPostedStatus(entry.status as string)) {
      return { error: "سند ثبت‌قطعی‌شده قابل حذف نیست؛ برای اصلاح، سند برگشتی ثبت کنید." };
    }
    const { error } = await context.supabase
      .from("journal_entries")
      .delete()
      .eq("id", data.id)
      .neq("status", "posted");
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
