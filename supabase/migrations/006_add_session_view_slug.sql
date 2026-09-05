-- 006_add_session_view_slug.sql
-- Adds a second, view-only public identifier per session, for
-- generating observer invite links distinct from the existing editor
-- `slug`.
--
-- IMPORTANT: this is a client-side UI distinction only. RLS on this
-- table is fully public (see 005_drop_sessions_owner.sql) - any anon
-- client can already read and write any session row directly via the
-- API regardless of which slug they hold. `view_slug` just lets the
-- app default a link's UI to read-only for people you only want
-- watching the board; it is not an access-control boundary.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS view_slug text;

-- Backfill existing rows with a random 8-char hex slug.
UPDATE public.sessions
  SET view_slug = substr(md5(gen_random_uuid()::text || clock_timestamp()::text || 'view'), 1, 8)
  WHERE view_slug IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN view_slug SET DEFAULT substr(md5(gen_random_uuid()::text || clock_timestamp()::text || 'view'), 1, 8),
  ALTER COLUMN view_slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_view_slug ON public.sessions(view_slug);
