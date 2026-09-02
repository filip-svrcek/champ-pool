-- 003_enable_realtime_publication.sql
-- Ensure Realtime is enabled for the public session tables.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime
  ADD TABLE IF NOT EXISTS public.sessions;

ALTER PUBLICATION supabase_realtime
  ADD TABLE IF NOT EXISTS public.session_events;
