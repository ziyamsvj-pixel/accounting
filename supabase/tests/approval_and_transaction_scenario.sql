-- pgTAP scenario for the accounting approval lifecycle.
-- Replace the fixture UUIDs with real auth.users IDs in the isolated test database.
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(18);

SELECT has_table('public', 'audit_events', 'audit_events exists');
SELECT has_table('public', 'account_nodes', 'account_nodes exists');
SELECT has_table('public', 'ledger_dimensions', 'ledger_dimensions exists');
SELECT has_function('public', 'create_journal_entry', 'create RPC exists');
SELECT has_function('public', 'submit_journal_entry', 'submit RPC exists');
SELECT has_function('public', 'approve_journal_entry', 'approve RPC exists');
SELECT has_function('public', 'post_journal_entry', 'post RPC exists');

-- The remaining tests are executable after the fixture IDs below are replaced.
-- Use authenticated sessions, not service_role, for RLS assertions.
--
-- SELECT set_config('request.jwt.claim.sub', '<EDITOR_A_UUID>', true);
-- SELECT lives_ok($sql$
--   SELECT public.create_journal_entry(
--     '2026-09-21', NULL, 'T-1001', 'valid balanced entry',
--     '[
--       {"account_code":"11010101","account_name":"Bank","debit":1000,"credit":0},
--       {"account_code":"31010101","account_name":"Capital","debit":0,"credit":1000}
--     ]'::jsonb
--   )
-- $sql$, 'editor can atomically create a draft');
--
-- SELECT throws_ok(
--   $$SELECT public.create_journal_entry(
--     '2026-09-21', NULL, 'T-1002', 'unbalanced entry',
--     '[
--       {"account_code":"11010101","account_name":"Bank","debit":1000,"credit":0},
--       {"account_code":"31010101","account_name":"Capital","debit":0,"credit":900}
--     ]'::jsonb
--   )$$,
--   '22023', NULL, 'unbalanced entry is rejected');
--
-- SELECT throws_ok(
--   $$SELECT public.create_journal_entry(
--     '2026-09-21', NULL, 'T-1003', 'negative line',
--     '[
--       {"account_code":"11010101","account_name":"Bank","debit":-1,"credit":0},
--       {"account_code":"31010101","account_name":"Capital","debit":0,"credit":-1}
--     ]'::jsonb
--   )$$,
--   '22023', NULL, 'negative amounts are rejected');
--
-- SELECT is(
--   (SELECT count(*)::integer FROM public.journal_entries WHERE document_number IN ('T-1002', 'T-1003')),
--   0,
--   'failed creates leave no journal headers');
-- SELECT is(
--   (SELECT count(*)::integer FROM public.audit_events WHERE event_type = 'journal.created' AND entity_id = '<FAILED_ENTRY_UUID>'::uuid),
--   0,
--   'failed creates leave no audit event');
--
-- -- After creating entry T-1001, capture its id and version in a fixture table.
-- SELECT lives_ok($$SELECT public.submit_journal_entry('<ENTRY_UUID>'::uuid, 1)$$,
--   'owner submits draft');
-- SELECT throws_ok($$SELECT public.approve_journal_entry('<ENTRY_UUID>'::uuid, 2)$$,
--   '22023', NULL, 'creator cannot approve own entry');
--
-- SELECT set_config('request.jwt.claim.sub', '<EDITOR_B_UUID>', true);
-- SELECT lives_ok($$SELECT public.approve_journal_entry('<ENTRY_UUID>'::uuid, 2)$$,
--   'different editor approves submitted entry');
-- SELECT throws_ok($$SELECT public.post_journal_entry('<ENTRY_UUID>'::uuid, 3)$$,
--   '22023', NULL, 'non-admin cannot post approved entry');
--
-- SELECT set_config('request.jwt.claim.sub', '<ADMIN_D_UUID>', true);
-- SELECT lives_ok($$SELECT public.post_journal_entry('<ENTRY_UUID>'::uuid, 3)$$,
--   'admin posts approved entry');
-- SELECT throws_ok($$UPDATE public.journal_entries SET description = 'tampered' WHERE id = '<ENTRY_UUID>'::uuid$$,
--   '42501', NULL, 'posted entry cannot be updated directly');
-- SELECT throws_ok($$DELETE FROM public.audit_events WHERE entity_id = '<ENTRY_UUID>'::uuid$$,
--   '42501', NULL, 'audit events cannot be deleted');
--
-- SELECT is(
--   (SELECT count(*)::integer FROM public.audit_events WHERE entity_id = '<ENTRY_UUID>'::uuid),
--   4,
--   'create, submit, approve, and post are audited');

SELECT * FROM finish();
ROLLBACK;
