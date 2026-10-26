import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
export const F2_DIR = join(ROOT, "docs/architecture/f2/sql");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

/** نقش‌ها و schema احراز هویت Supabase به‌صورت حداقلی، برای اجرای Migrationهای واقعی. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export const U = {
  editorA: "00000000-0000-4000-8000-00000000000a",
  editorB: "00000000-0000-4000-8000-00000000000b",
  admin: "00000000-0000-4000-8000-00000000000c",
  approver: "00000000-0000-4000-8000-00000000000d",
  poster: "00000000-0000-4000-8000-00000000000e",
  viewer: "00000000-0000-4000-8000-00000000000f",
  outsider: "00000000-0000-4000-8000-000000000010",
} as const;

export const f2File = (name: string) => readFileSync(join(F2_DIR, name), "utf8");
export const F2_FORWARD = [
  "000_baseline_drift.sql",
  "010_org_membership.sql",
  "020_accounts_periods.sql",
  "030_journal_expand.sql",
  "040_support_tables.sql",
  "050_backfill.sql",
  "060_integrity.sql",
  "070_rpc.sql",
  "080_rls.sql",
];

export async function legacyDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS_DIR).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  }
  await db.exec(f2File("000_baseline_drift.sql"));
  return db;
}

/** دادهٔ نمونه با شکل فعلی production: سند پیش‌نویس و ثبت‌قطعی برای دو کاربر. */
export async function seedLegacy(db: PGlite) {
  for (const id of Object.values(U)) {
    await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, '{}')", [id]);
  }
  // تریگر Supabase نقش editor را داده است؛ نقش‌های ویژه:
  await db.exec(`
    delete from public.user_roles where user_id in ('${U.viewer}', '${U.outsider}');
    insert into public.user_roles (user_id, role) values ('${U.viewer}', 'viewer'), ('${U.admin}', 'admin');
  `);
  const entry = async (
    user: string,
    num: string,
    date: string,
    status: string,
    lines: [string, string, number, number, string | null][],
  ) => {
    const r = await db.query<{ id: string }>(
      `insert into public.journal_entries (user_id, entry_date, document_number, description, status, created_at)
       values ($1, $2::date, $3, 'سند قدیمی', $4, $5::timestamptz) returning id`,
      [user, date, num, status, date],
    );
    const id = r.rows[0]!.id;
    for (const [code, name, dr, cr, sub] of lines) {
      await db.query(
        `insert into public.journal_lines (entry_id, account_code, account_name, debit, credit, subsidiary_code)
         values ($1, $2, $3, $4, $5, $6)`,
        [id, code, name, dr, cr, sub],
      );
    }
    return id;
  };
  const posted1 = await entry(U.editorA, "A-1", "2026-10-25", "posted", [
    ["6101", "هزینهٔ اداری", 1_500_000, 0, null],
    ["1101", "صندوق", 0, 1_500_000, "01"],
  ]);
  const posted2 = await entry(U.editorB, "B-1", "2026-10-20", "posted", [
    ["6101", "هزینه اداری", 200_000, 0, null],
    ["1101", "صندوق", 0, 200_000, null],
  ]);
  const draftA = await entry(U.editorA, "A-2", "2026-10-26", "draft", [
    ["6101", "هزینهٔ اداری", 90_000, 0, null],
    ["1101", "صندوق", 0, 90_000, null],
  ]);
  return { posted1, posted2, draftA };
}

export async function migrate(db: PGlite) {
  for (const f of F2_FORWARD.slice(1)) {
    try {
      await db.exec(f2File(f));
    } catch (e) {
      throw new Error(`${f}: ${(e as Error).message}`);
    }
  }
}

/** اجرای دستور به‌عنوان کاربر احراز هویت‌شدهٔ Supabase (role authenticated + JWT sub). */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** کد خطای Domain از detail خطای Postgres (RPCها)، یا پیام برای خطاهای Trigger/RLS. */
export async function failure(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    const err = e as { detail?: string; message: string; code?: string };
    return { code: err.detail ?? err.code, message: err.message };
  }
  throw new Error("انتظار خطا می‌رفت ولی دستور موفق شد.");
}
