/**
 * تست Migrationهای پیش‌نویس F2 روی PostgreSQL واقعی (PGlite) با Migrationهای فعلی مخزن و دادهٔ نمونه.
 * این فایل‌ها هنوز در supabase/migrations نیستند و روی پایگاه‌دادهٔ واقعی اجرا نشده‌اند.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";
import { U, asUser, f2File, failure, legacyDb, migrate, seedLegacy } from "./harness";

type Ids = Awaited<ReturnType<typeof seedLegacy>>;
let db: PGlite;
let ids: Ids;

const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0]!;
const rpc = <T = Record<string, unknown>>(fn: string, args: unknown[]) =>
  one<{ r: T }>(
    `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`,
    args,
  ).then((x) => x.r);
const key = (s: string) => `key-${s}-000001`;
const ver = async (id: string) =>
  (await one<{ version: number }>("select version from public.journal_entries where id = $1", [id]))
    .version;

async function grant(userId: string, role: string) {
  await db.query(
    `insert into public.company_members (company_id, user_id, role)
     select id, $1, $2::public.company_role from public.companies limit 1`,
    [userId, role],
  );
}

/** پیش‌نویس جدید از مسیر فعلی برنامه (insert مستقیم کاربر) */
async function clientDraft(userId: string, num: string, amount: number, date = "2026-10-27") {
  return asUser(db, userId, async () => {
    const e = await one<{ id: string }>(
      `insert into public.journal_entries (user_id, entry_date, document_number, description, status)
       values ($1, $2, $3, 'خرید لوازم', 'draft') returning id`,
      [userId, date, num],
    );
    await db.query(
      `insert into public.journal_lines (entry_id, account_code, account_name, debit, credit)
       values ($1, '6101', 'هزینهٔ اداری', $2, 0), ($1, '1101', 'صندوق', 0, $2)`,
      [e.id, amount],
    );
    return e.id;
  });
}

async function postThroughWorkflow(entryId: string, tag: string) {
  const v = await ver(entryId);
  const s = await asUser(db, U.editorA, () =>
    rpc<{ version: number }>("submit_entry", [entryId, v, key(`${tag}-s`)]),
  );
  const a = await asUser(db, U.approver, () =>
    rpc<{ version: number }>("approve_entry", [entryId, s.version, key(`${tag}-a`)]),
  );
  return asUser(db, U.poster, () =>
    rpc<{ version: number; posted_number: string; status: string }>("post_entry", [
      entryId,
      a.version,
      key(`${tag}-p`),
      "sha256:test",
    ]),
  );
}

beforeEach(async () => {
  db = await legacyDb();
  ids = await seedLegacy(db);
  await migrate(db);
  await grant(U.approver, "approver");
  await grant(U.poster, "poster");
});

describe("Backfill دادهٔ فعلی", () => {
  test("ساختار سازمانی، دوره، حساب و شمارهٔ قطعی ساخته می‌شود", async () => {
    expect(await one("select count(*)::int n from public.companies")).toEqual({ n: 1 });
    const roles = await db.query<{ user_id: string; role: string }>(
      "select user_id, role::text from public.company_members order by user_id, role",
    );
    expect(roles.rows.find((r) => r.user_id === U.viewer)?.role).toBe("viewer");
    expect(roles.rows.some((r) => r.user_id === U.admin && r.role === "admin")).toBe(true);
    const acc = await one<{ name: string; needs_review: boolean }>(
      "select name, needs_review from public.accounts where code = '6101'",
    );
    expect(acc.needs_review).toBe(true);
    const entries = await db.query<{
      document_number: string;
      posted_number: string | null;
      code: string;
    }>(
      `select e.document_number, e.posted_number, p.code from public.journal_entries e
       join public.fiscal_periods p on p.id = e.fiscal_period_id order by e.document_number`,
    );
    expect(entries.rows).toEqual([
      { document_number: "A-1", posted_number: "1", code: "1405-08" },
      { document_number: "A-2", posted_number: null, code: "1405-08" },
      { document_number: "B-1", posted_number: "1", code: "1405-07" },
    ]);
    const line = await one<{ debit_minor: string; line_no: number; account_id: string | null }>(
      "select debit_minor::text, line_no, account_id from public.journal_lines where entry_id = $1 and debit > 0",
      [ids.posted1],
    );
    expect(line).toMatchObject({ debit_minor: "1500000", line_no: 1 });
    expect(line.account_id).not.toBeNull();
    const audit = await one<{ n: number }>(
      "select count(*)::int n from public.audit_log where action = 'LEGACY_IMPORT'",
    );
    expect(audit.n).toBe(3);
  });

  test("Backfill با مبلغ اعشاری ریال متوقف می‌شود و هیچ تغییری نمی‌ماند", async () => {
    const fresh = await legacyDb();
    await seedLegacy(fresh);
    await fresh.exec(
      "update public.journal_lines set debit = debit + 0.5 where debit > 0 and debit < 100000",
    );
    for (const f of [
      "010_org_membership.sql",
      "020_accounts_periods.sql",
      "030_journal_expand.sql",
      "040_support_tables.sql",
    ]) {
      await fresh.exec(f2File(f));
    }
    await expect(fresh.exec(f2File("050_backfill.sql"))).rejects.toThrow(/اعشار/);
    expect((await fresh.query("select count(*)::int n from public.companies")).rows[0]).toEqual({
      n: 0,
    });
  });

  test("تبدیل شمسی با تقویم ICU (fa-IR) برای ده سال یکسان است", async () => {
    const fmt = new Intl.DateTimeFormat("en-US-u-ca-persian", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: "UTC",
    });
    const rows = (
      await db.query<{ d: string; jy: number; jm: number; jd: number }>(
        `select d::date::text d, j.jy, j.jm, j.jd
         from generate_series('2020-01-01'::date, '2030-12-31'::date, interval '1 day') d,
              lateral app_private.to_jalali(d::date) j`,
      )
    ).rows;
    let mismatches = 0;
    for (const r of rows) {
      const p = Object.fromEntries(
        fmt.formatToParts(new Date(`${r.d}T00:00:00Z`)).map((x) => [x.type, x.value]),
      );
      if (Number(p.year) !== r.jy || Number(p.month) !== r.jm || Number(p.day) !== r.jd)
        mismatches++;
    }
    expect(rows.length).toBeGreaterThan(4000);
    expect(mismatches).toBe(0);
  });
});

describe("سازگاری با برنامهٔ فعلی (مرحلهٔ Expand)", () => {
  test("ساخت، ویرایش و حذف پیش‌نویس مثل قبل کار می‌کند و Company خودکار تعیین می‌شود", async () => {
    const id = await clientDraft(U.editorA, "A-3", 50_000);
    const e = await one<{ company_id: string | null; created_by: string; version: number }>(
      "select company_id, created_by, version from public.journal_entries where id = $1",
      [id],
    );
    expect(e.company_id).not.toBeNull();
    expect(e.created_by).toBe(U.editorA);
    await asUser(db, U.editorA, async () => {
      await db.query(
        "update public.journal_lines set debit = 60000, credit = 0 where entry_id = $1 and debit > 0",
        [id],
      );
      const l = await one<{ debit_minor: string }>(
        "select debit_minor::text from public.journal_lines where entry_id = $1 and debit > 0",
        [id],
      );
      expect(l.debit_minor).toBe("60000");
      await db.query("delete from public.journal_entries where id = $1", [id]);
    });
    expect(
      await one("select count(*)::int n from public.journal_entries where id = $1", [id]),
    ).toEqual({ n: 0 });
  });

  test("ثبت مستقیم سند قطعی و مبلغ اعشاری ریال رد می‌شود", async () => {
    const r = await failure(
      asUser(db, U.editorA, () =>
        db.query(
          `insert into public.journal_entries (user_id, entry_date, document_number, status)
           values ($1, '2026-10-27', 'X-1', 'posted')`,
          [U.editorA],
        ),
      ),
    );
    expect(r.message).toContain("پیش‌نویس");
    const id = await clientDraft(U.editorA, "A-4", 1000);
    const f = await failure(
      asUser(db, U.editorA, () =>
        db.query("update public.journal_lines set debit = 10.5 where entry_id = $1 and debit > 0", [
          id,
        ]),
      ),
    );
    expect(f.message).toContain("اعشار");
  });

  test("سند Posted: تغییر مبلغ، سرسند و حذف ممنوع؛ فقط تکمیل فیلد خالی مجاز", async () => {
    await asUser(db, U.editorA, async () => {
      expect(
        (
          await failure(
            db.query("update public.journal_lines set debit = 1 where entry_id = $1", [
              ids.posted1,
            ]),
          )
        ).message,
      ).toContain("فقط تکمیل");
      expect(
        (
          await failure(
            db.query("update public.journal_entries set description = 'x' where id = $1", [
              ids.posted1,
            ]),
          )
        ).message,
      ).toContain("قابل تغییر نیست");
      expect(
        (await failure(db.query("delete from public.journal_entries where id = $1", [ids.posted1])))
          .message,
      ).toContain("فقط سند پیش‌نویس");
      expect(
        (
          await failure(
            db.query(
              "update public.journal_lines set subsidiary_code = '02' where entry_id = $1 and subsidiary_code = '01'",
              [ids.posted1],
            ),
          )
        ).message,
      ).toContain("قابل تغییر نیست");
      await db.query(
        "update public.journal_lines set subsidiary_code = 'S-9' where entry_id = $1 and subsidiary_code is null",
        [ids.posted1],
      );
    });
    const n = await one<{ n: number }>(
      "select count(*)::int n from public.journal_lines where entry_id = $1 and subsidiary_code = 'S-9'",
      [ids.posted1],
    );
    expect(n.n).toBe(1);
  });

  test("حتی مالک پایگاه‌داده (RPC/مهاجرت) سند Posted را ویرایش نمی‌کند و Audit تغییرناپذیر است", async () => {
    expect(
      (
        await failure(
          db.query("update public.journal_lines set credit = 5 where entry_id = $1", [ids.posted1]),
        )
      ).message,
    ).toContain("فقط تکمیل");
    expect((await failure(db.query("update public.audit_log set action = 'X'"))).message).toContain(
      "قابل ویرایش یا حذف نیست",
    );
    expect((await failure(db.query("delete from public.audit_log"))).message).toContain(
      "قابل ویرایش",
    );
  });
});

describe("گردش‌کار RPC", () => {
  test("ارسال → تأیید → ثبت قطعی با شمارهٔ بی‌فاصله و Audit/Outbox", async () => {
    const id = await clientDraft(U.editorA, "A-5", 75_000);
    const p = await postThroughWorkflow(id, "wf1");
    expect(p).toMatchObject({ status: "posted", posted_number: "2", replayed: false });
    const id2 = await clientDraft(U.editorA, "A-6", 10_000);
    expect((await postThroughWorkflow(id2, "wf2")).posted_number).toBe("3");
    const actions = (
      await db.query<{ action: string }>(
        "select action from public.audit_log where entry_id = $1 order by id",
        [id],
      )
    ).rows.map((r) => r.action);
    expect(actions).toEqual(["SUBMIT", "APPROVE", "POST"]);
    const ev = (
      await db.query<{ type: string }>(
        "select type from public.outbox_events where entry_id = $1 order by occurred_at, type",
        [id],
      )
    ).rows.map((r) => r.type);
    expect(ev.sort()).toEqual(["journal.approved", "journal.posted", "journal.submitted"]);
  });

  test("تفکیک وظایف، نقش، نسخه و تکرار درخواست", async () => {
    const id = await clientDraft(U.editorA, "A-7", 75_000);
    await asUser(db, U.editorA, async () => rpc("submit_entry", [id, await ver(id), key("sod-s")]));
    const sv = await ver(id);
    // ایجادکننده‌ای که نقش approver هم دارد، سند خودش را تأیید نمی‌کند
    await grant(U.editorA, "approver");
    expect(
      (
        await failure(
          asUser(db, U.editorA, async () => rpc("approve_entry", [id, sv, key("sod-a1")])),
        )
      ).code,
    ).toBe("SEGREGATION_OF_DUTIES");
    expect(
      (
        await failure(
          asUser(db, U.viewer, async () => rpc("approve_entry", [id, sv, key("sod-a2")])),
        )
      ).code,
    ).toBe("PERMISSION_DENIED");
    expect(
      (
        await failure(
          asUser(db, U.approver, async () => rpc("approve_entry", [id, sv - 1, key("sod-a3")])),
        )
      ).code,
    ).toBe("CONCURRENCY_CONFLICT");
    const a1 = await asUser(db, U.approver, async () =>
      rpc<{ version: number }>("approve_entry", [id, sv, key("sod-a4")]),
    );
    const again = await asUser(db, U.approver, async () =>
      rpc<{ replayed: boolean }>("approve_entry", [id, sv, key("sod-a4")]),
    );
    expect(again.replayed).toBe(true);
    expect(
      (
        await failure(
          asUser(db, U.approver, async () => rpc("submit_entry", [id, a1.version, key("sod-a4")])),
        )
      ).code,
    ).toBe("IDEMPOTENCY_KEY_REUSED");
    // سند در جریان تأیید از مسیر مستقیم قابل تغییر نیست
    expect(
      (
        await failure(
          asUser(db, U.editorA, () =>
            db.query("update public.journal_lines set debit = 1 where entry_id = $1", [id]),
          ),
        )
      ).message,
    ).toMatch(/در جریان تأیید|row-level security|0 rows/);
  });

  test("تغییر سطر پیش‌نویس نسخه را بالا می‌برد؛ ارسال با نسخهٔ قدیمی رد می‌شود", async () => {
    const id = await clientDraft(U.editorA, "A-14", 10_000);
    const before = await ver(id);
    await asUser(db, U.editorA, () =>
      db.query(
        "update public.journal_lines set description = 'ویرایش' where entry_id = $1 and debit > 0",
        [id],
      ),
    );
    expect(await ver(id)).toBe(before + 1);
    expect(
      (
        await failure(
          asUser(db, U.editorA, async () => rpc("submit_entry", [id, before, key("stale")])),
        )
      ).code,
    ).toBe("CONCURRENCY_CONFLICT");
  });

  test("سند نامتوازن ارسال نمی‌شود و حساب ناشناخته ثبت قطعی نمی‌شود", async () => {
    const id = await clientDraft(U.editorA, "A-8", 10_000);
    await asUser(db, U.editorA, () =>
      db.query("update public.journal_lines set debit = 9000 where entry_id = $1 and debit > 0", [
        id,
      ]),
    );
    expect(
      (
        await failure(
          asUser(db, U.editorA, async () => rpc("submit_entry", [id, await ver(id), key("unb")])),
        )
      ).code,
    ).toBe("UNBALANCED");
    const id2 = await clientDraft(U.editorA, "A-9", 10_000);
    await asUser(db, U.editorA, () =>
      db.query(
        "update public.journal_lines set account_code = '9999' where entry_id = $1 and debit > 0",
        [id2],
      ),
    );
    expect(
      (
        await failure(
          asUser(db, U.editorA, async () => rpc("submit_entry", [id2, await ver(id2), key("unk")])),
        )
      ).code,
    ).toBe("UNKNOWN_ACCOUNT");
  });

  test("دورهٔ بسته: ساخت پیش‌نویس و ثبت قطعی متوقف می‌شود", async () => {
    const id = await clientDraft(U.editorA, "A-10", 10_000);
    const s = await asUser(db, U.editorA, async () =>
      rpc<{ version: number }>("submit_entry", [id, await ver(id), key("pc-s")]),
    );
    const a = await asUser(db, U.approver, async () =>
      rpc<{ version: number }>("approve_entry", [id, s.version, key("pc-a")]),
    );
    await db.exec("update public.fiscal_periods set status = 'CLOSED' where code = '1405-08'");
    expect(
      (
        await failure(
          asUser(db, U.poster, async () => rpc("post_entry", [id, a.version, key("pc-p"), null])),
        )
      ).code,
    ).toBe("PERIOD_CLOSED");
    expect((await failure(clientDraft(U.editorA, "A-11", 1))).message).toContain("بسته");
  });
});

describe("سند برگشتی", () => {
  test("فقط یک برگشت؛ سطرها قفل؛ ثبت برگشتی سند اصلی را در همان تراکنش REVERSED می‌کند", async () => {
    const r = await asUser(db, U.poster, () =>
      rpc<{ entry_id: string; version: number }>("create_reversal", [
        ids.posted1,
        "2026-10-28",
        "اشتباه",
        key("rv-c"),
      ]),
    );
    expect(
      (
        await failure(
          asUser(db, U.poster, async () =>
            rpc("create_reversal", [ids.posted1, "2026-10-28", "دوباره", key("rv-c2")]),
          ),
        )
      ).code,
    ).toBe("REVERSAL_IN_PROGRESS");
    expect(
      (
        await failure(
          asUser(db, U.poster, () =>
            db.query("update public.journal_lines set debit = 1 where entry_id = $1", [r.entry_id]),
          ),
        )
      ).message,
    ).toMatch(/برگشتی|row-level security/);
    // سند برگشتی را مدیر (admin) ارسال، تأییدکننده تأیید و ثبت‌کننده ثبت می‌کند
    const s = await asUser(db, U.admin, async () =>
      rpc<{ version: number }>("submit_entry", [r.entry_id, 1, key("rv-s")]),
    );
    const a = await asUser(db, U.approver, async () =>
      rpc<{ version: number }>("approve_entry", [r.entry_id, s.version, key("rv-a")]),
    );
    const p = await asUser(db, U.poster, () =>
      rpc<{ status: string }>("post_entry", [r.entry_id, a.version, key("rv-p"), null]),
    );
    expect(p.status).toBe("posted");
    const o = await one<{ status: string; reversed_by_id: string }>(
      "select status, reversed_by_id from public.journal_entries where id = $1",
      [ids.posted1],
    );
    expect(o).toEqual({ status: "reversed", reversed_by_id: r.entry_id });
    const sums = await one<{ dr: string; cr: string }>(
      `select sum(debit_minor)::text dr, sum(credit_minor)::text cr from public.journal_lines
       where entry_id in ($1, $2) and account_code = '6101'`,
      [ids.posted1, r.entry_id],
    );
    expect(sums).toEqual({ dr: "1500000", cr: "1500000" });
    const actions = (
      await db.query<{ action: string }>(
        "select action from public.audit_log where entry_id in ($1, $2) and action <> 'LEGACY_IMPORT' order by id",
        [ids.posted1, r.entry_id],
      )
    ).rows.map((x) => x.action);
    expect(actions).toEqual(["CREATE_REVERSAL", "SUBMIT", "APPROVE", "POST", "REVERSE"]);
  });

  test("برگشتیِ دست‌کاری‌شده ثبت قطعی نمی‌شود", async () => {
    const r = await asUser(db, U.poster, () =>
      rpc<{ entry_id: string }>("create_reversal", [
        ids.posted1,
        "2026-10-28",
        "اشتباه",
        key("rt-c"),
      ]),
    );
    const s = await asUser(db, U.admin, async () =>
      rpc<{ version: number }>("submit_entry", [r.entry_id, 1, key("rt-s")]),
    );
    const a = await asUser(db, U.approver, async () =>
      rpc<{ version: number }>("approve_entry", [r.entry_id, s.version, key("rt-a")]),
    );
    await db.exec(`
      alter table public.journal_lines disable trigger journal_lines_guard;
      update public.journal_lines set debit_minor = 1, debit = 1 where entry_id = '${r.entry_id}' and debit > 0;
      update public.journal_lines set credit_minor = 1, credit = 1 where entry_id = '${r.entry_id}' and credit > 0;
      alter table public.journal_lines enable trigger journal_lines_guard;
    `);
    expect(
      (
        await failure(
          asUser(db, U.poster, async () =>
            rpc("post_entry", [r.entry_id, a.version, key("rt-p"), null]),
          ),
        )
      ).code,
    ).toBe("REVERSAL_MISMATCH");
    expect(
      await one("select status from public.journal_entries where id = $1", [ids.posted1]),
    ).toEqual({
      status: "posted",
    });
  });
});

describe("تکمیل اتمیک سند Posted", () => {
  test("همه یا هیچ: خطا در یک سطر، تکمیل سطر دیگر را هم برمی‌گرداند", async () => {
    const lines = (
      await db.query<{ id: string; subsidiary_code: string | null }>(
        "select id, subsidiary_code from public.journal_lines where entry_id = $1 order by line_no",
        [ids.posted1],
      )
    ).rows;
    const bad = [
      { id: lines[0]!.id, detail1_code: "P-1" },
      { id: lines[1]!.id, subsidiary_code: "99" },
    ];
    expect(
      (
        await failure(
          asUser(db, U.editorA, async () =>
            rpc("enrich_posted_lines", [ids.posted1, JSON.stringify(bad)]),
          ),
        )
      ).code,
    ).toBe("POSTED_IMMUTABLE");
    expect(
      await one(
        "select count(*)::int n from public.journal_lines where entry_id = $1 and detail1_code is not null",
        [ids.posted1],
      ),
    ).toEqual({ n: 0 });
    const ok = [
      { id: lines[0]!.id, detail1_code: "  P-1 ", detail1_name: " پروژه " },
      { id: lines[1]!.id, subsidiary_code: "01" },
    ];
    const r = await asUser(db, U.editorA, () =>
      rpc<{ filled: number }>("enrich_posted_lines", [ids.posted1, JSON.stringify(ok)]),
    );
    expect(r.filled).toBe(2);
    expect(
      await one("select detail1_code, detail1_name from public.journal_lines where id = $1", [
        lines[0]!.id,
      ]),
    ).toEqual({ detail1_code: "P-1", detail1_name: "پروژه" });
    expect(
      (
        await failure(
          asUser(db, U.viewer, async () => rpc("enrich_posted_lines", [ids.posted1, "[]"])),
        )
      ).code,
    ).toBe("PERMISSION_DENIED");
  });
});

describe("RLS سازمانی", () => {
  test("پیش‌نویس دیگران دیده نمی‌شود؛ سند ثبت‌شدهٔ شرکت دیده می‌شود؛ کاربر بیرونی هیچ", async () => {
    const seen = async (u: string) =>
      asUser(db, u, async () =>
        (
          await db.query<{ document_number: string }>(
            "select document_number from public.journal_entries order by document_number",
          )
        ).rows.map((r) => r.document_number),
      );
    expect(await seen(U.editorB)).toEqual(["A-1", "B-1"]);
    expect(await seen(U.editorA)).toEqual(["A-1", "A-2", "B-1"]);
    expect(await seen(U.viewer)).toEqual(["A-1", "B-1"]);
    expect(await seen(U.outsider)).toEqual([]);
    const lines = await asUser(db, U.outsider, () =>
      db.query("select id from public.journal_lines"),
    );
    expect(lines.rows).toHaveLength(0);
  });

  test("viewer و کاربر بیرونی سند نمی‌سازند؛ editor پیش‌نویس دیگری را تغییر نمی‌دهد", async () => {
    expect((await failure(clientDraft(U.viewer, "V-1", 1000))).message).toMatch(
      /row-level security|شرکت/,
    );
    expect((await failure(clientDraft(U.outsider, "O-1", 1000))).message).toMatch(/شرکت/);
    const upd = await asUser(db, U.editorB, () =>
      db.query("update public.journal_entries set description = 'x' where id = $1", [ids.draftA]),
    );
    expect(upd.affectedRows ?? 0).toBe(0);
  });

  test("جدول‌های داخلی برای کاربر بسته است و Audit فقط برای بازبین", async () => {
    await asUser(db, U.editorA, async () => {
      expect((await failure(db.query("select * from public.outbox_events"))).message).toContain(
        "permission denied",
      );
      expect((await failure(db.query("select * from public.idempotency_keys"))).message).toContain(
        "permission denied",
      );
      expect((await db.query("select * from public.audit_log")).rows).toHaveLength(0);
    });
    const n = await asUser(
      db,
      U.approver,
      async () => (await db.query("select * from public.audit_log")).rows.length,
    );
    expect(n).toBeGreaterThan(0);
  });
});

describe("Rollback و Contract", () => {
  test("Rollback مرحلهٔ Expand، برنامهٔ فعلی را به حالت قبل برمی‌گرداند", async () => {
    await db.exec(f2File("099_rollback_010_080.sql"));
    const cols = await one<{ n: number }>(
      "select count(*)::int n from information_schema.columns where table_name = 'journal_entries' and column_name = 'company_id'",
    );
    expect(cols.n).toBe(0);
    // مسیر قدیمی: ثبت مستقیم سند قطعی دوباره ممکن است و دادهٔ قبلی سالم است
    await asUser(db, U.editorA, () =>
      db.query(
        `insert into public.journal_entries (user_id, entry_date, document_number, status)
         values ($1, '2026-10-27', 'R-1', 'posted')`,
        [U.editorA],
      ),
    );
    expect(await one("select count(*)::int n from public.journal_lines")).toEqual({ n: 6 });
  });

  test("Rollback با سند در گردش‌کار جدید متوقف می‌شود", async () => {
    const id = await clientDraft(U.editorA, "A-12", 1000);
    await asUser(db, U.editorA, async () => rpc("submit_entry", [id, await ver(id), key("rb-s")]));
    await expect(db.exec(f2File("099_rollback_010_080.sql"))).rejects.toThrow(/Rollback متوقف شد/);
  });

  test("Contract اعمال می‌شود و پس از آن هم برنامه از مسیر سازمانی کار می‌کند", async () => {
    await db.exec(f2File("090_contract.sql"));
    const id = await clientDraft(U.editorA, "A-13", 5000);
    expect((await postThroughWorkflow(id, "ct")).status).toBe("posted");
    const seen = await asUser(
      db,
      U.editorB,
      async () =>
        (await db.query("select id from public.journal_entries where id = $1", [id])).rows.length,
    );
    expect(seen).toBe(1);
  });
});
