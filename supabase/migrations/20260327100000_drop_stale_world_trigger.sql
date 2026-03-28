-- Drop stale Phase 2 trigger on users table that references dropped world_instances table
-- This trigger was left behind when Phase 2 code was cleaned up

-- Drop any trigger on users that references world_instances
DO $$
DECLARE
  trig RECORD;
BEGIN
  FOR trig IN
    SELECT t.tgname, t.tgrelid::regclass::text AS table_name
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE p.prosrc LIKE '%world%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', trig.tgname, trig.table_name);
    RAISE NOTICE 'Dropped trigger: % on %', trig.tgname, trig.table_name;
  END LOOP;
END $$;

-- Drop any functions that reference world_instances
DO $$
DECLARE
  func RECORD;
BEGIN
  FOR func IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosrc LIKE '%world%'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', func.proname, func.args);
    RAISE NOTICE 'Dropped function: %(%)', func.proname, func.args;
  END LOOP;
END $$;

-- Also drop the table itself if it somehow still exists
DROP TABLE IF EXISTS public.world_instances CASCADE;
