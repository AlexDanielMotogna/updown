'use client';

// The terminal is dark-only, so the theme tokens are a constant (the app exposes
// them via context for its light/dark toggle). Ported from apps/web/src/lib/theme.
import { darkTokens, type ThemeTokens } from './theme';

export function useThemeTokens(): ThemeTokens {
  return darkTokens;
}

const DICEBEAR_BASE_URL = 'https://api.dicebear.com/9.x/shapes/svg';

export function getAvatarUrl(address: string): string {
  return `${DICEBEAR_BASE_URL}?seed=${address}`;
}

export interface UserIdentity {
  walletAddress: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export function truncateWallet(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function getDisplayName(user: UserIdentity): string {
  const name = user.displayName?.trim();
  return name && name.length > 0 ? name : truncateWallet(user.walletAddress);
}

export function getDisplayAvatar(user: UserIdentity): string {
  const url = user.avatarUrl?.trim();
  return url && url.length > 0 ? url : getAvatarUrl(user.walletAddress);
}
