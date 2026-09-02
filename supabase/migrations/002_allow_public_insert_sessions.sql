-- 002_allow_public_insert_sessions.sql
-- Public-session MVP: anonymous users can create and update shared sessions.
-- Authenticated users may still own a session and remain allowed to edit it.

-- Remove strict insert/update/delete policies from the default example
DROP POLICY IF EXISTS sessions_auth_insert ON public.sessions;
DROP POLICY IF EXISTS sessions_owner_update ON public.sessions;
DROP POLICY IF EXISTS sessions_owner_delete ON public.sessions;

-- Allow inserts when owner is NULL (public session) or when owner matches auth.uid()
CREATE POLICY sessions_insert_public ON public.sessions
FOR INSERT
WITH CHECK (owner IS NULL OR auth.uid() = owner);

-- Allow updates when owner is NULL (everyone can edit the shared public session)
-- or when owner matches auth.uid()
CREATE POLICY sessions_update_public ON public.sessions
FOR UPDATE
USING (owner IS NULL OR auth.uid() = owner)
WITH CHECK (owner IS NULL OR auth.uid() = owner);

-- Allow deletes only for the public session or the owner
CREATE POLICY sessions_delete_public ON public.sessions
FOR DELETE
USING (owner IS NULL OR auth.uid() = owner);
