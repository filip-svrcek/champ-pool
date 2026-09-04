-- 004_add_session_slug.sql
-- Adds a short, non-sequential public identifier for sessions.
-- The bigint `id` is sequential and trivially guessable/enumerable
-- (?session=1, ?session=2, ...), which matters because the public RLS
-- policies (002_allow_public_insert_sessions.sql) let anyone read AND
-- write any owner-less session. `slug` becomes the identifier used in
-- shareable links and live-session lookups instead of `id`.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS slug text;

-- Backfill existing rows with a random 8-char hex slug.
UPDATE public.sessions
  SET slug = substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8)
  WHERE slug IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN slug SET DEFAULT substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8),
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_slug ON public.sessions(slug);
