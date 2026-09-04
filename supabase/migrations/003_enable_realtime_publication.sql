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

  -- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS form, so guard
  -- it manually to keep this migration re-runnable.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'session_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.session_events;
  END IF;
END $$;
