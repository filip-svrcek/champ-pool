-- 005_drop_sessions_owner.sql
-- The app never sets an authenticated owner (all sessions are created
-- anonymously with owner = NULL), so the owner-based branches of the
-- RLS policies are dead code. Drop the column and simplify the
-- policies to unconditionally public, matching actual usage.

DROP POLICY IF EXISTS sessions_insert_public ON public.sessions;
DROP POLICY IF EXISTS sessions_update_public ON public.sessions;
DROP POLICY IF EXISTS sessions_delete_public ON public.sessions;

CREATE POLICY sessions_insert_public ON public.sessions
FOR INSERT
WITH CHECK (true);

CREATE POLICY sessions_update_public ON public.sessions
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY sessions_delete_public ON public.sessions
FOR DELETE
USING (true);

ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS owner;
