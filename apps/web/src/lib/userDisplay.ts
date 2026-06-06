import { getAvatarUrl } from './constants';

/**
 * Shared fallbacks for any place that renders another user's identity.
 * We never trust the wallet truncation directly inline anymore - every
 * surface should go through these so a profile rename instantly flows to
 * leaderboards, activity feeds, squads, tournaments, referrals and
 * notifications without re-deriving the ternary by hand.
 *
 * `displayName` / `avatarUrl` are accepted as `null | undefined | ''` so
 * callers can pass server responses straight through without normalising
 * - empty strings count as "not set" the same as null.
 */

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
