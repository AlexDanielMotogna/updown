-- Close the PostgREST-facing roles out of the public schema.
--
-- WHY THIS EXISTS
--
-- The managed Postgres this project runs on ships three roles that a plain
-- Postgres does not have: anon, authenticated and service_role. The first two
-- back an HTTP data API that is enabled by default and reachable from the
-- internet, authenticated by a key the platform's own model treats as
-- publishable, because row level security is what is supposed to do the
-- gating. Every table in `public` had full DML granted to those roles and RLS
-- enabled on none of them, so the only thing standing between the internet and
-- the whole database was the secrecy of a key designed not to be secret.
--
-- The root cause is not the tables, it is the default privileges: new tables in
-- `public` inherit the grant automatically, so every future migration reopens
-- the hole. Part 3 is the one that actually fixes it; parts 1 and 2 clean up
-- what already exists.
--
-- WHY THIS CANNOT LOCK THE APPLICATION OUT
--
-- Two independent reasons, both verified against the live databases before this
-- was written. The application's role has rolbypassrls = t, so RLS does not
-- apply to it at all. It is also the owner of every table in `public`, and RLS
-- does not apply to a table's owner unless FORCE ROW LEVEL SECURITY is set,
-- which nothing here does. anon and authenticated have rolbypassrls = f.
--
-- service_role is deliberately left alone: it has BYPASSRLS by design, it backs
-- the platform dashboard, and its key is a declared secret rather than a
-- publishable one.
--
-- IDEMPOTENT. Enabling RLS on a table that already has it, and revoking a
-- privilege that is already revoked, are both no-ops. This has already been
-- applied by hand to the environments that existed when it was written, so
-- there it will do nothing. It is committed so that a database restored from a
-- backup, or a new environment, gets the same treatment without anyone having
-- to remember. That matters more here than usual: this control has no symptom
-- when it is missing. The application behaves identically either way, so a
-- silent regression would only surface the day somebody exploits it.

DO $$
DECLARE
  t record;
  n int := 0;
BEGIN
  -- Skip cleanly where those roles do not exist, which is the case on a plain
  -- local Postgres. Without this guard the REVOKE statements below would fail
  -- and take local development and CI down with them.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'rls-lockdown: anon/authenticated roles absent, nothing to do';
    RETURN;
  END IF;

  -- 1. RLS on every table in public. With no policies defined, this denies
  --    everything to any role that is neither the owner nor BYPASSRLS.
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    n := n + 1;
  END LOOP;

  -- 2. Drop the blanket grants. Defence in depth: if RLS is ever disabled on a
  --    table, the absence of a grant still keeps these roles out.
  EXECUTE 'REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated';
  EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
  EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';

  -- 3. The actual fix: stop new tables inheriting the grant. Applies to objects
  --    created by the role running this, which is the role Prisma migrates as.
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';

  RAISE NOTICE 'rls-lockdown: RLS enabled on % table(s), grants and default privileges revoked', n;
END $$;
