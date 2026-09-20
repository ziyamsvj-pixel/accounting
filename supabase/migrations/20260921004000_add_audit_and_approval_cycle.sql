-- Audit trail and journal approval lifecycle.
-- Apply this migration only after reviewing the preflight queries in the project guide.
-- Existing status values must be limited to: draft, posted.

BEGIN;

-- 1. Normalize ownership and lifecycle metadata.
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by UUID,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_by UUID,
  ADD COLUMN IF NOT EXISTS return_reason TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE public.journal_entries
SET created_by = user_id
WHERE created_by IS NULL;

ALTER TABLE public.journal_entries
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_user_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id),
  ADD CONSTRAINT journal_entries_created_by_fk
    FOREIGN KEY (created_by) REFERENCES auth.users(id),
  ADD CONSTRAINT journal_entries_submitted_by_fk
    FOREIGN KEY (submitted_by) REFERENCES auth.users(id),
  ADD CONSTRAINT journal_entries_approved_by_fk
    FOREIGN KEY (approved_by) REFERENCES auth.users(id),
  ADD CONSTRAINT journal_entries_posted_by_fk
    FOREIGN KEY (posted_by) REFERENCES auth.users(id),
  ADD CONSTRAINT journal_entries_locked_by_fk
    FOREIGN KEY (locked_by) REFERENCES auth.users(id),
  ADD CONSTRAINT journal_entries_returned_by_fk
    FOREIGN KEY (returned_by) REFERENCES auth.users(id);

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_status_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_status_check
  CHECK (status IN ('draft', 'submitted', 'approved', 'posted', 'locked', 'returned', 'reversed'));

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_version_positive;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_version_positive CHECK (version > 0);

-- 2. Basic line-level accounting invariants.
ALTER TABLE public.journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_non_negative_amounts,
  DROP CONSTRAINT IF EXISTS journal_lines_one_side_only;

ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_non_negative_amounts
    CHECK (debit >= 0 AND credit >= 0),
  ADD CONSTRAINT journal_lines_one_side_only
    CHECK (NOT (debit > 0 AND credit > 0));

-- 3. Append-only audit events.
CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx
  ON public.audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON public.audit_events (actor_id, occurred_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

DROP POLICY IF EXISTS "audit select owner or admin" ON public.audit_events;
CREATE POLICY "audit select owner or admin" ON public.audit_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      entity_type = 'journal_entry'
      AND EXISTS (
        SELECT 1
        FROM public.journal_entries e
        WHERE e.id = audit_events.entity_id
          AND e.user_id = auth.uid()
      )
    )
  );

-- No INSERT/UPDATE/DELETE policy is intentionally provided for authenticated.
-- Audit writes occur only inside SECURITY DEFINER command functions below.
REVOKE INSERT, UPDATE, DELETE ON public.audit_events FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.write_audit_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_events (
    actor_id, event_type, entity_type, entity_id,
    before_data, after_data, reason, request_id, metadata
  )
  VALUES (
    auth.uid(), p_event_type, p_entity_type, p_entity_id,
    p_before_data, p_after_data, p_reason, p_request_id, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_event(TEXT, TEXT, UUID, JSONB, JSONB, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_entry_date DATE,
  p_entry_date_fa TEXT,
  p_document_number TEXT,
  p_description TEXT,
  p_lines JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id UUID;
  v_user_id UUID := auth.uid();
  v_line_count INTEGER;
  v_total_debit NUMERIC(18, 2);
  v_total_credit NUMERIC(18, 2);
  v_before JSONB;
  v_after JSONB;
BEGIN
  IF v_user_id IS NULL OR NOT public.can_edit(v_user_id) THEN
    RAISE EXCEPTION 'insufficient permission' USING ERRCODE = '42501';
  END IF;

  IF p_entry_date IS NULL OR p_document_number IS NULL OR btrim(p_document_number) = '' THEN
    RAISE EXCEPTION 'invalid journal header' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), COALESCE(sum(x.debit), 0), COALESCE(sum(x.credit), 0)
  INTO v_line_count, v_total_debit, v_total_credit
  FROM jsonb_to_recordset(COALESCE(p_lines, '[]'::jsonb)) AS x(
    account_id UUID,
    account_code TEXT,
    account_name TEXT,
    debit NUMERIC,
    credit NUMERIC,
    description TEXT
  );

  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'journal entry requires at least two lines' USING ERRCODE = '22023';
  END IF;

  IF round(v_total_debit, 2) <= 0 OR round(v_total_debit, 2) <> round(v_total_credit, 2) THEN
    RAISE EXCEPTION 'journal entry is not balanced' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_lines, '[]'::jsonb)) AS x(
      account_id UUID,
      account_code TEXT,
      account_name TEXT,
      debit NUMERIC,
      credit NUMERIC,
      description TEXT
    )
    WHERE NULLIF(btrim(x.account_code), '') IS NULL
      OR NULLIF(btrim(x.account_name), '') IS NULL
      OR x.debit < 0 OR x.credit < 0
      OR (x.debit > 0 AND x.credit > 0)
      OR (x.debit = 0 AND x.credit = 0)
  ) THEN
    RAISE EXCEPTION 'invalid journal line' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(p_lines, '[]'::jsonb)) AS x(
      account_id UUID,
      account_code TEXT,
      account_name TEXT,
      debit NUMERIC,
      credit NUMERIC,
      description TEXT
    )
    WHERE x.account_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.account_nodes a
        WHERE a.id = x.account_id AND a.level = 'detail' AND a.is_active
      )
  ) THEN
    RAISE EXCEPTION 'journal line references an invalid detail account' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.journal_entries (
    user_id, created_by, entry_date, entry_date_fa, document_number, description, status
  )
  VALUES (
    v_user_id, v_user_id, p_entry_date, p_entry_date_fa, btrim(p_document_number), p_description, 'draft'
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_lines (
    entry_id, account_id, account_code, account_name, debit, credit, description
  )
  SELECT
    v_entry_id, x.account_id, btrim(x.account_code), btrim(x.account_name), x.debit, x.credit, x.description
  FROM jsonb_to_recordset(p_lines) AS x(
    account_id UUID,
    account_code TEXT,
    account_name TEXT,
    debit NUMERIC,
    credit NUMERIC,
    description TEXT
  );

  SELECT to_jsonb(e) INTO v_after
  FROM public.journal_entries e
  WHERE e.id = v_entry_id;

  PERFORM public.write_audit_event(
    'journal.created', 'journal_entry', v_entry_id, NULL, v_after, NULL
  );

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_journal_entry(DATE, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_journal_entry(DATE, TEXT, TEXT, TEXT, JSONB)
  TO authenticated;

-- 4. Hierarchical chart of accounts.
-- `group` is the top level, followed by `general`, `subsidiary`, `detail_1`, and `detail_2`.
-- Existing journal lines remain usable until account_id is backfilled.
CREATE TABLE IF NOT EXISTS public.account_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.account_nodes(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('group', 'general', 'subsidiary', 'detail_1', 'detail_2')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, code),
  UNIQUE (id, level)
);

CREATE INDEX IF NOT EXISTS account_nodes_parent_idx
  ON public.account_nodes (parent_id);
CREATE INDEX IF NOT EXISTS account_nodes_level_idx
  ON public.account_nodes (level);

ALTER TABLE public.account_nodes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.account_nodes TO authenticated;
GRANT ALL ON public.account_nodes TO service_role;

DROP POLICY IF EXISTS "account nodes select authenticated" ON public.account_nodes;
CREATE POLICY "account nodes select authenticated" ON public.account_nodes
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.validate_account_node_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_parent_level TEXT;
BEGIN
  IF NEW.parent_id IS NULL AND NEW.level <> 'group' THEN
    RAISE EXCEPTION 'only group accounts may be root nodes' USING ERRCODE = '23514';
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'an account cannot be its own parent' USING ERRCODE = '23514';
    END IF;

    SELECT level INTO v_parent_level
    FROM public.account_nodes
    WHERE id = NEW.parent_id;

    IF v_parent_level IS NULL THEN
      RAISE EXCEPTION 'account parent does not exist' USING ERRCODE = '23503';
    END IF;

    IF (v_parent_level, NEW.level) NOT IN (
      ('group', 'general'),
      ('general', 'subsidiary'),
      ('subsidiary', 'detail_1'),
      ('detail_1', 'detail_2')
    ) THEN
      RAISE EXCEPTION 'invalid account hierarchy: % -> %', v_parent_level, NEW.level
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_nodes_parent_validation ON public.account_nodes;
CREATE TRIGGER account_nodes_parent_validation
  BEFORE INSERT OR UPDATE OF parent_id, level ON public.account_nodes
  FOR EACH ROW EXECUTE FUNCTION public.validate_account_node_parent();

DROP TRIGGER IF EXISTS account_nodes_updated_at ON public.account_nodes;
CREATE TRIGGER account_nodes_updated_at
  BEFORE UPDATE ON public.account_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.account_nodes(id);

CREATE INDEX IF NOT EXISTS journal_lines_account_idx
  ON public.journal_lines (account_id);

-- A line can be linked to any active posting account. During the backfill period
-- account_id is nullable so existing records are not invalidated.
CREATE OR REPLACE FUNCTION public.validate_journal_line_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.account_nodes
    WHERE id = NEW.account_id AND is_active = true AND level IN ('detail_1', 'detail_2')
  ) THEN
    RAISE EXCEPTION 'journal line must reference an active detail account'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_lines_account_validation ON public.journal_lines;
CREATE TRIGGER journal_lines_account_validation
  BEFORE INSERT OR UPDATE OF account_id ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.validate_journal_line_account();

-- 5. Optional accounting dimensions for subsidiary analysis.
CREATE TABLE IF NOT EXISTS public.ledger_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_type TEXT NOT NULL CHECK (dimension_type IN (
    'party', 'project', 'cost_center', 'contract', 'branch', 'custom'
  )),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dimension_type, code)
);

CREATE TABLE IF NOT EXISTS public.journal_line_dimensions (
  journal_line_id UUID NOT NULL REFERENCES public.journal_lines(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES public.ledger_dimensions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (journal_line_id, dimension_id)
);

CREATE INDEX IF NOT EXISTS journal_line_dimensions_dimension_idx
  ON public.journal_line_dimensions (dimension_id);

ALTER TABLE public.ledger_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_line_dimensions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ledger_dimensions, public.journal_line_dimensions TO authenticated;
GRANT ALL ON public.ledger_dimensions, public.journal_line_dimensions TO service_role;

CREATE POLICY "ledger dimensions select authenticated" ON public.ledger_dimensions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "line dimensions select via owner" ON public.journal_line_dimensions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.id = l.entry_id
    WHERE l.id = journal_line_dimensions.journal_line_id
      AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "line dimensions insert via owner" ON public.journal_line_dimensions
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.id = l.entry_id
    WHERE l.id = journal_line_dimensions.journal_line_id
      AND e.user_id = auth.uid()
      AND e.status IN ('draft', 'returned')
      AND public.can_edit(auth.uid())
  ));

CREATE POLICY "line dimensions delete via owner" ON public.journal_line_dimensions
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1
    FROM public.journal_lines l
    JOIN public.journal_entries e ON e.id = l.entry_id
    WHERE l.id = journal_line_dimensions.journal_line_id
      AND e.user_id = auth.uid()
      AND e.status IN ('draft', 'returned')
      AND public.can_edit(auth.uid())
  ));

-- 6. Restrict direct updates/deletes. Existing permissive policies are combined
-- with these restrictive policies, so both conditions must pass.
DROP POLICY IF EXISTS "journal entries lifecycle update guard" ON public.journal_entries;
CREATE POLICY "journal entries lifecycle update guard" ON public.journal_entries
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (status IN ('draft', 'returned'))
  WITH CHECK (status IN ('draft', 'returned'));

DROP POLICY IF EXISTS "journal entries lifecycle insert guard" ON public.journal_entries;
CREATE POLICY "journal entries lifecycle insert guard" ON public.journal_entries
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (status = 'draft');

DROP POLICY IF EXISTS "journal entries lifecycle delete guard" ON public.journal_entries;
CREATE POLICY "journal entries lifecycle delete guard" ON public.journal_entries
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (status IN ('draft', 'returned'));

DROP POLICY IF EXISTS "journal lines lifecycle update guard" ON public.journal_lines;
CREATE POLICY "journal lines lifecycle update guard" ON public.journal_lines
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journal_entries e
    WHERE e.id = journal_lines.entry_id
      AND e.status IN ('draft', 'returned')
  ));

DROP POLICY IF EXISTS "journal lines lifecycle insert guard" ON public.journal_lines;
CREATE POLICY "journal lines lifecycle insert guard" ON public.journal_lines
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.journal_entries e
    WHERE e.id = journal_lines.entry_id
      AND e.status IN ('draft', 'returned')
  ));

DROP POLICY IF EXISTS "journal lines lifecycle delete guard" ON public.journal_lines;
CREATE POLICY "journal lines lifecycle delete guard" ON public.journal_lines
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journal_entries e
    WHERE e.id = journal_lines.entry_id
      AND e.status IN ('draft', 'returned')
  ));

-- 7. Shared transition helper. It locks the row, checks the expected version,
-- updates the lifecycle metadata, and records an audit event atomically.
CREATE OR REPLACE FUNCTION public.transition_journal_entry(
  p_entry_id UUID,
  p_expected_version INTEGER,
  p_to_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.journal_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.journal_entries;
  v_before JSONB;
  v_after JSONB;
  v_actor UUID := auth.uid();
  v_can_edit BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_entry
  FROM public.journal_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'journal entry not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_entry.version <> p_expected_version THEN
    RAISE EXCEPTION 'stale journal entry version' USING ERRCODE = '40001';
  END IF;

  v_can_edit := public.can_edit(v_actor);
  IF NOT v_can_edit THEN
    RAISE EXCEPTION 'insufficient permission' USING ERRCODE = '42501';
  END IF;

  IF p_to_status = 'submitted' THEN
    IF v_entry.status NOT IN ('draft', 'returned') OR v_entry.user_id <> v_actor THEN
      RAISE EXCEPTION 'invalid submit transition' USING ERRCODE = '22023';
    END IF;
  ELSIF p_to_status = 'returned' THEN
    IF v_entry.status <> 'submitted' OR v_entry.user_id = v_actor OR p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'invalid return transition' USING ERRCODE = '22023';
    END IF;
  ELSIF p_to_status = 'approved' THEN
    IF v_entry.status <> 'submitted' OR v_entry.user_id = v_actor THEN
      RAISE EXCEPTION 'invalid approve transition' USING ERRCODE = '22023';
    END IF;
  ELSIF p_to_status = 'posted' THEN
    IF v_entry.status <> 'approved' OR NOT public.has_role(v_actor, 'admin') THEN
      RAISE EXCEPTION 'invalid post transition' USING ERRCODE = '22023';
    END IF;
  ELSIF p_to_status = 'locked' THEN
    IF v_entry.status <> 'posted' OR NOT public.has_role(v_actor, 'admin') THEN
      RAISE EXCEPTION 'invalid lock transition' USING ERRCODE = '22023';
    END IF;
  ELSIF p_to_status = 'reversed' THEN
    IF v_entry.status NOT IN ('posted', 'locked') OR NOT public.has_role(v_actor, 'admin') OR p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'invalid reverse transition' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported target status' USING ERRCODE = '22023';
  END IF;

  v_before := to_jsonb(v_entry);

  UPDATE public.journal_entries
  SET status = p_to_status,
      submitted_at = CASE WHEN p_to_status = 'submitted' THEN now() ELSE submitted_at END,
      submitted_by = CASE WHEN p_to_status = 'submitted' THEN v_actor ELSE submitted_by END,
      approved_at = CASE WHEN p_to_status = 'approved' THEN now() ELSE approved_at END,
      approved_by = CASE WHEN p_to_status = 'approved' THEN v_actor ELSE approved_by END,
      posted_at = CASE WHEN p_to_status = 'posted' THEN now() ELSE posted_at END,
      posted_by = CASE WHEN p_to_status = 'posted' THEN v_actor ELSE posted_by END,
      locked_at = CASE WHEN p_to_status = 'locked' THEN now() ELSE locked_at END,
      locked_by = CASE WHEN p_to_status = 'locked' THEN v_actor ELSE locked_by END,
      returned_at = CASE WHEN p_to_status = 'returned' THEN now() ELSE returned_at END,
      returned_by = CASE WHEN p_to_status = 'returned' THEN v_actor ELSE returned_by END,
      return_reason = CASE WHEN p_to_status = 'returned' THEN p_reason ELSE return_reason END,
      version = version + 1
  WHERE id = p_entry_id;

  SELECT * INTO v_entry FROM public.journal_entries WHERE id = p_entry_id;
  v_after := to_jsonb(v_entry);

  PERFORM public.write_audit_event(
    'journal.' || p_to_status,
    'journal_entry',
    p_entry_id,
    v_before,
    v_after,
    p_reason
  );

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_journal_entry(UUID, INTEGER, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_journal_entry(UUID, INTEGER, TEXT, TEXT)
  TO authenticated;

-- 6. Explicit command wrappers provide a stable API for the application layer.
CREATE OR REPLACE FUNCTION public.submit_journal_entry(p_entry_id UUID, p_expected_version INTEGER)
RETURNS public.journal_entries
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.transition_journal_entry(p_entry_id, p_expected_version, 'submitted', NULL);
$$;

CREATE OR REPLACE FUNCTION public.return_journal_entry(p_entry_id UUID, p_expected_version INTEGER, p_reason TEXT)
RETURNS public.journal_entries
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.transition_journal_entry(p_entry_id, p_expected_version, 'returned', p_reason);
$$;

CREATE OR REPLACE FUNCTION public.approve_journal_entry(p_entry_id UUID, p_expected_version INTEGER)
RETURNS public.journal_entries
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.transition_journal_entry(p_entry_id, p_expected_version, 'approved', NULL);
$$;

CREATE OR REPLACE FUNCTION public.post_journal_entry(p_entry_id UUID, p_expected_version INTEGER)
RETURNS public.journal_entries
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.transition_journal_entry(p_entry_id, p_expected_version, 'posted', NULL);
$$;

CREATE OR REPLACE FUNCTION public.lock_journal_entry(p_entry_id UUID, p_expected_version INTEGER)
RETURNS public.journal_entries
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.transition_journal_entry(p_entry_id, p_expected_version, 'locked', NULL);
$$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_entry_id UUID, p_expected_version INTEGER, p_reason TEXT)
RETURNS public.journal_entries
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.transition_journal_entry(p_entry_id, p_expected_version, 'reversed', p_reason);
$$;

REVOKE ALL ON FUNCTION public.submit_journal_entry(UUID, INTEGER),
  public.return_journal_entry(UUID, INTEGER, TEXT),
  public.approve_journal_entry(UUID, INTEGER),
  public.post_journal_entry(UUID, INTEGER),
  public.lock_journal_entry(UUID, INTEGER),
  public.reverse_journal_entry(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_journal_entry(UUID, INTEGER),
  public.return_journal_entry(UUID, INTEGER, TEXT),
  public.approve_journal_entry(UUID, INTEGER),
  public.post_journal_entry(UUID, INTEGER),
  public.lock_journal_entry(UUID, INTEGER),
  public.reverse_journal_entry(UUID, INTEGER, TEXT)
  TO authenticated;

COMMIT;
