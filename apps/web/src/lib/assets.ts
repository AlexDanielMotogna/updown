/**
 * Canonical metadata for the crypto assets the app supports - colors, display
 * names, and small helpers. Anything that needs the human-readable name of a
 * ticker, the brand tint to paint a tile/chart with, or a fallback display
 * label should pull from here instead of redefining its own ad-hoc tables.
 *
 * Add a new asset by extending both maps + listing it in SUPPORTED_ASSETS.
 */

/** Display name shown in titles ("Bitcoin Up or Down 5m", etc). */
export const ASSET_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XRP: 'XRP',
  DOGE: 'Dogecoin',
};

/** Brand colors used for the colored asset tile in PoolPageHeader, the
 *  snake line on the chart, sidebar rows, etc. Pulled from each network's
 *  canonical brand palette. */
export const ASSET_TINTS: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
  XRP: '#5A6470',
  DOGE: '#C2A633',
};

/** Display name for a ticker; falls back to the ticker itself for assets
 *  we don't have a long-form name for. */
export function getAssetName(asset: string | null | undefined): string {
  if (!asset) return '';
  return ASSET_NAMES[asset] ?? asset;
}

/** Brand color for an asset; callers should pass a theme-token fallback
 *  for assets without an entry (typically the accent token). */
export function getAssetTint(asset: string | null | undefined, fallback: string): string {
  if (!asset) return fallback;
  return ASSET_TINTS[asset] ?? fallback;
}
