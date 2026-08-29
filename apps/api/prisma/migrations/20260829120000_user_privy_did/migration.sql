-- Bind an UpDown user to a verified Privy identity.
--
-- Until now every /api/exchange route took the acting identity from a
-- `walletAddress` field in the request body, with no authentication. Wallet
-- addresses are public, so anyone could act as anyone. This column is the
-- missing link: a verified Privy access token carries a DID (`sub`), and this
-- maps that DID to exactly one UpDown user, so the server can derive the wallet
-- instead of being told it.
--
-- Nullable on purpose: accounts created before token auth have no DID yet, and
-- it is bound on the first authenticated request. UNIQUE so one Privy account
-- can never claim two UpDown identities.
ALTER TABLE "users" ADD COLUMN "privy_did" TEXT;
CREATE UNIQUE INDEX "users_privy_did_key" ON "users"("privy_did");
