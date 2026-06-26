'use client';

import type { ReactNode } from 'react';
import {
  AddCircleOutline,
  EmojiEvents,
  Paid,
  CalendarToday,
  LocalFireDepartment,
  ArrowUpward,
  Group,
  Stars,
} from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { formatTimeAgo } from '@/lib/format';

type Tokens = ReturnType<typeof useThemeTokens>;

export interface RewardMeta {
  label: string;
  color: string;
  icon: ReactNode;
}

/** Label / icon / colour for a reward-log `reason`. Shared by the Overview
 *  recent-activity list and the Rewards tab feed. */
export function getRewardMeta(reason: string, t: Tokens, size = 16): RewardMeta {
  switch (reason) {
    case 'BET_PLACED': return { label: 'Prediction placed', color: t.text.secondary, icon: <AddCircleOutline sx={{ fontSize: size }} /> };
    case 'BET_WON': return { label: 'Prediction won', color: t.gain, icon: <EmojiEvents sx={{ fontSize: size }} /> };
    case 'CLAIM_COMPLETED': return { label: 'Payout claimed', color: t.gain, icon: <Paid sx={{ fontSize: size }} /> };
    case 'DAILY_FIRST_BET':
    case 'DAILY_BONUS': return { label: 'Daily bonus', color: t.info, icon: <CalendarToday sx={{ fontSize: size }} /> };
    case 'WIN_STREAK': return { label: 'Win streak bonus', color: t.accent, icon: <LocalFireDepartment sx={{ fontSize: size }} /> };
    case 'LEVEL_UP': return { label: 'Level up', color: t.prediction, icon: <ArrowUpward sx={{ fontSize: size }} /> };
    case 'REFERRAL_ACCEPTED': return { label: 'Referral joined', color: t.accent, icon: <Group sx={{ fontSize: size }} /> };
    default: return { label: reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), color: t.text.secondary, icon: <Stars sx={{ fontSize: size }} /> };
  }
}

/** Compact "2h ago" / "3d ago" relative time. */
/** @deprecated use formatTimeAgo from '@/lib/format' — kept as a thin re-export
 *  so existing call sites stay put while the output is now unified + compact. */
export function formatRelativeTime(iso: string): string {
  return formatTimeAgo(iso);
}
