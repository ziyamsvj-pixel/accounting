ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS subsidiary_code text,
  ADD COLUMN IF NOT EXISTS subsidiary_name text,
  ADD COLUMN IF NOT EXISTS detail1_code text,
  ADD COLUMN IF NOT EXISTS detail1_name text,
  ADD COLUMN IF NOT EXISTS detail2_code text,
  ADD COLUMN IF NOT EXISTS detail2_name text;