// ---------------------------------------------------------------------------
// Centralized constants  single source of truth
// ---------------------------------------------------------------------------

// Pacifica
export const PACIFICA_API_URL = 'https://api.pacifica.fi';
export const PACIFICA_WS_URL = 'wss://ws.pacifica.fi/ws';

// Colors
export const UP_COLOR = '#4ADE80';
export const DOWN_COLOR = '#F87171';
export const GAIN_COLOR = '#22C55E';
export const ACCENT_COLOR = '#F59E0B';

// UP Coins: stored as base units, divide by this to get display value
// e.g. 10 stored = 0.10 UP displayed ($1 bet earns 0.10 UP)
export const UP_COINS_DIVISOR = 100;

// Avatars
export const DICEBEAR_BASE_URL = 'https://api.dicebear.com/9.x/shapes/svg';
export function getAvatarUrl(address: string): string {
  return `${DICEBEAR_BASE_URL}?seed=${address}`;
}

// Business logic
export const FEE_BPS_DIVISOR = 10_000;
export const DEFAULT_FEE_PERCENT = 0.05; // 5% fallback when no user profile
export const UP_COINS_PER_DOLLAR = 10; // base units earned per $1 bet

// API
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

// Solana
export const USDC_MINT_ADDRESS = 'By87mHK9Meinfv4AEqTx9qyYmGDLUcwiywpkkCWwGUVz';
export const EXPLORER_URL = 'https://explorer.solana.com';
export const SOLANA_CLUSTER = 'devnet';

// ---------------------------------------------------------------------------
// Interval display
// ---------------------------------------------------------------------------
export const INTERVAL_LABELS: Record<string, string> = {
  '3m': 'Turbo 3m',
  '5m': 'Rapid 5m',
  '15m': 'Short 15m',
  '1h': 'Hourly',
};

export const INTERVAL_TAG_IMAGES: Record<string, string> = {
  '3m': '/assets/turbo-tag.png',
  '5m': '/assets/rapid-tag.png',
  '15m': '/assets/short-tag.png',
  '1h': '/assets/hourly-tag.png',
};

// ---------------------------------------------------------------------------
// Box art — asset-interval specific boxes take priority, then asset fallback
// ---------------------------------------------------------------------------
export const ASSET_INTERVAL_BOX_IMAGE: Record<string, string> = {
  'BTC-3m': '/boxes/Btc-3min.png',
  'BTC-5m': '/boxes/Btc-5min.png',
  'BTC-15m': '/boxes/Btc-15min.png',
  'BTC-1h': '/boxes/Btc-1h.png',
  'ETH-3m': '/boxes/Eth-3min.png',
  'ETH-5m': '/boxes/Eth-5min.png',
  'ETH-15m': '/boxes/Eth-15min.png',
  'ETH-1h': '/boxes/Eth-1h.png',
  'SOL-3m': '/boxes/Sol-3min.png',
  'SOL-5m': '/boxes/Sol-5min.png',
  'SOL-15m': '/boxes/Sol-15min.png',
  'SOL-1h': '/boxes/Sol-1h.png',
};

export const ASSET_BOX_IMAGE: Record<string, string> = {
  BTC: '/boxes/Btc-box.png',
  ETH: '/boxes/Eth-box.png',
  SOL: '/boxes/Sol-box.png',
};

export function getBoxImage(asset: string, interval: string): string | undefined {
  return ASSET_INTERVAL_BOX_IMAGE[`${asset}-${interval}`] ?? ASSET_BOX_IMAGE[asset];
}
