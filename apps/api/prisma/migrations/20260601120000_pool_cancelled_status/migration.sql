-- Add CANCELLED status for pools that can never resolve (e.g. Polymarket markets
-- delisted from Gamma, or stuck PM markets where UMA never closes within our
-- grace window). winner stays NULL on these; bets are refunded (or there are
-- no bets) and the on-chain account is closed to reclaim rent.

ALTER TYPE "PoolStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
