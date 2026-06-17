import { darkTokens as t } from '@/lib/theme';
import { type StatusKind } from '../ui';

// Shared types + constants for the PmExplorer admin UI, extracted so the main
// component and the Browse Gamma tags dialog can share them without a cycle.

// ─── Types ───────────────────────────────────────────────────────────────
export interface PmCategory {
  code: string;
  label: string;
  tagIds: string[];
  tags: string[];
  minVolume24h: number;
  maxDaysAhead: number;
  maxMarkets: number;
  maxSubmarketsPerEvent: number;
  matchPriority: number;
  poolCount: number;
  cachedMarketCount: number;
  lastBulkSyncAt: string | null;
}

export interface PmTag {
  id: string;
  label: string;
  slug: string;
  count: number;
  inUse: boolean;
  categoryCode: string | null;
}

export interface PmMarketRow {
  externalId: string;
  question: string;
  opponent: string | null;
  image: string | null;
  endDate: string;
  status: string;
  subcategory: string | null;
  marketOdds: number | null;
  poolExists: boolean;
  poolId: string | null;
  poolStatus: string | null;
  lastSyncedAt: string;
}

export const MARKET_STATUS_KIND: Record<string, StatusKind> = {
  SCHEDULED: 'info',
  LIVE: 'warning',
  FINISHED: 'neutral',
  CANCELLED: 'error',
};

// PM admin uses a single accent color - matches the public app's `t.prediction`
// purple, which is what the Polymarket bucket renders as.
export const PM_ACCENT = t.prediction;
