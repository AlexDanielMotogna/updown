-- Actor-stamped audit trail for the admin panel.
--
-- Rotating a credential is only half a control. The other half is being able
-- to say what the previous one did, which needs the actor on every record and
-- not just the action.

CREATE TABLE "admin_actions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT,
    "key_fingerprint" TEXT,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "request_body" JSONB,
    "outcome" JSONB,
    "duration_ms" INTEGER NOT NULL,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_actions_created_at_idx" ON "admin_actions"("created_at");
CREATE INDEX "admin_actions_key_fingerprint_created_at_idx" ON "admin_actions"("key_fingerprint", "created_at");
CREATE INDEX "admin_actions_path_created_at_idx" ON "admin_actions"("path", "created_at");

-- ── Append-only enforcement ─────────────────────────────────────────────────
--
-- Two mechanisms, because the first one alone was measured to do nothing here.
--
-- 1. REVOKE. Removes UPDATE/DELETE/TRUNCATE from the connecting role's ACL.
--    Verified to take effect (the ACL drops to `arxt`), but it is a PERMISSION
--    check, and PostgreSQL superusers bypass permission checks entirely. So on
--    its own it guarantees nothing unless the application role is known not to
--    be one. Kept regardless: it is free, and it is the half that starts
--    holding the moment the connecting role is a plain one.
--
-- 2. A trigger. Triggers are NOT bypassed by superusers, so this is what
--    actually holds. An attacker with API-level code execution who calls
--    `prisma.adminAction.deleteMany()` gets an exception, not an empty table.
--
-- What the trigger is still not: a wall against someone with direct superuser
-- SQL access, who can DROP or DISABLE it. That is the point of the design
-- though. Erasing the trail now requires a deliberate DDL statement rather
-- than an ORM call that looks like ordinary application traffic.
--
-- CONSEQUENCE FOR OPERATIONS: this table cannot be pruned by the application,
-- ever. At the admin panel's write volume (order of a dozen a day) that is
-- thousands of rows a year and not worth a retention policy. If one is ever
-- needed, it takes a deliberate `ALTER TABLE admin_actions DISABLE TRIGGER`
-- by a human with the Railway credentials. That friction is intentional.

DO $$
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE admin_actions FROM %I', current_user);
EXCEPTION
  -- Managed Postgres providers can refuse this. Do not fail the migration over
  -- it: the trigger below is the load-bearing half.
  WHEN OTHERS THEN
    RAISE NOTICE 'admin_actions: REVOKE failed for %, relying on the trigger alone', current_user;
END $$;

CREATE OR REPLACE FUNCTION admin_actions_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_actions is append-only: % is not permitted on this table', TG_OP
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'The admin audit trail is the record of what a possibly-compromised credential did. Removing rows from it is never a routine operation.';
END;
$$;

-- Row-level for UPDATE/DELETE, statement-level for TRUNCATE (which has no rows
-- to iterate and is refused outright).
CREATE TRIGGER admin_actions_no_update_delete
  BEFORE UPDATE OR DELETE ON admin_actions
  FOR EACH ROW EXECUTE FUNCTION admin_actions_append_only();

CREATE TRIGGER admin_actions_no_truncate
  BEFORE TRUNCATE ON admin_actions
  FOR EACH STATEMENT EXECUTE FUNCTION admin_actions_append_only();
