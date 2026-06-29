'use client';

import type { ReactNode } from 'react';
import { CurrencyBitcoin, SportsSoccer, Gavel, Public, TheaterComedy, AccountBalance, HelpOutline } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

type Tokens = ReturnType<typeof useThemeTokens>;

export interface CategoryMeta {
  label: string;
  color: string;
  icon: ReactNode;
}

/**
 * Single source of truth for how a pool category (Crypto / Sports / each PM_*)
 * is labelled and coloured. Used by both the profile History filter chips and
 * the Overview per-category breakdown so they never drift apart.
 */
export function getCategoryMeta(key: string, t: Tokens, size = 16): CategoryMeta {
  switch (key) {
    case 'CRYPTO': return { label: 'Crypto', color: t.up, icon: <CurrencyBitcoin sx={{ fontSize: size }} /> };
    case 'SPORTS': return { label: 'Sports', color: t.draw, icon: <SportsSoccer sx={{ fontSize: size }} /> };
    case 'PM_POLITICS': return { label: 'Politics', color: t.prediction, icon: <Gavel sx={{ fontSize: size }} /> };
    case 'PM_GEO': return { label: 'Geopolitics', color: t.info, icon: <Public sx={{ fontSize: size }} /> };
    case 'PM_CULTURE': return { label: 'Culture', color: t.categoryColors.culture, icon: <TheaterComedy sx={{ fontSize: size }} /> };
    case 'PM_FINANCE': return { label: 'Finance', color: t.categoryColors.finance, icon: <AccountBalance sx={{ fontSize: size }} /> };
    default: {
      const label = key.startsWith('PM_')
        ? key.slice(3).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        : key;
      return { label, color: t.prediction, icon: <HelpOutline sx={{ fontSize: size }} /> };
    }
  }
}

/** Filter chips shown on the History tab (in order). */
export const HISTORY_FILTERS = ['ALL', 'CRYPTO', 'SPORTS', 'PM_POLITICS', 'PM_GEO', 'PM_CULTURE', 'PM_FINANCE'] as const;
