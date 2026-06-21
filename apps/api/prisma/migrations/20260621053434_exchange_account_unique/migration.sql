-- Bind-once: one on-exchange account (EVM/HL wallet) ↔ one UpDown user per network.
-- Anti dual-binding / XP farming. Authoritative DB-level guarantee.

-- 1) Dedup any pre-existing duplicates, keeping the most-recently-updated row
--    (ties broken by id). No-op when there are no duplicates.
DELETE FROM "exchange_connections" a
USING "exchange_connections" b
WHERE a."exchange" = b."exchange"
  AND a."is_testnet" = b."is_testnet"
  AND a."account_address" = b."account_address"
  AND (
    a."updated_at" < b."updated_at"
    OR (a."updated_at" = b."updated_at" AND a."id" < b."id")
  );

-- 2) Enforce uniqueness.
CREATE UNIQUE INDEX "exchange_account_unique" ON "exchange_connections"("exchange", "is_testnet", "account_address");
