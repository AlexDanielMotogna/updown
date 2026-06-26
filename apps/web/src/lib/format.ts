import { EXPLORER_URL, SOLANA_CLUSTER } from '@/lib/constants';
import { darkTokens, withAlpha } from '@/lib/theme';

export const USDC_DECIMALS = 6;
export const USDC_DIVISOR = 1_000_000;

export function formatUSDC(amount: string, fractionDigits?: { min?: number; max?: number }): string {
  const value = Number(amount) / USDC_DIVISOR;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits?.min ?? 0,
    maximumFractionDigits: fractionDigits?.max ?? 2,
  }).format(value);
}

export function formatPrice(price: string | null): string {
  if (!price) return '-';
  const value = Number(price) / USDC_DIVISOR;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Picks the decimal count we should render for an asset price by magnitude.
 *  BTC at $73k reads fine in 2 decimals; SOL at $82 needs 4 to be meaningful
 *  (strike of $82.6274 must not display as $82.63 - that's a different price
 *  for win/loss purposes). Sub-dollar alts get up to 6 (USDC precision). */
export function priceDecimalsFor(value: number): number {
  const v = Math.abs(value);
  if (v >= 1000) return 2;
  if (v >= 100) return 3;
  if (v >= 10) return 4;
  if (v >= 1) return 5;
  return 6;
}

/** Format an already-scaled (USD, not USDC bigint) price using magnitude-aware
 *  decimals. Use this for live ticks and strikes where rounding to 2 places
 *  would distort the on-chain win/loss number. */
export function formatLivePrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const d = priceDecimalsFor(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(value);
}

export function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Compact, never-overflowing relative time for activity feeds: "now", "5m",
 * "4h", "2d", "3w", then a short date for anything older. One shared formatter
 * so every feed reads the same and a large value can't break a fixed-width row.
 * Accepts an ISO string, an epoch-ms number, or a Date.
 */
export function formatTimeAgo(input: string | number | Date): string {
  const ts = input instanceof Date ? input.getTime()
    : typeof input === 'number' ? input
    : new Date(input).getTime();
  const diff = Date.now() - ts;
  if (!Number.isFinite(diff)) return '';
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** "May 29, 10:35 PM - 10:40 PM CEST" - formatted in the viewer's local
 *  timezone with their locale's TZ abbreviation (so a Berlin user sees
 *  "MESZ", a New Yorker sees "EDT", etc).
 *
 *  Heads-up: this is render-time TZ-dependent. During Next.js SSR it uses
 *  the server TZ (UTC) and re-renders to the user TZ on hydration. Consumers
 *  must set `suppressHydrationWarning` on the element rendering the result
 *  to avoid a noisy React warning. */
export function formatPredictionWindow(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const date = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  };
  const startTime = start.toLocaleTimeString('en-US', timeOpts);
  const endTime = end.toLocaleTimeString('en-US', timeOpts);
  // Use `undefined` locale so the abbreviation comes back in the user's
  // language ("MESZ" for de-DE, "CEST" / "EDT" for en-*). `timeZoneName:
  // 'short'` is the well-supported variant; some runtimes return "GMT+2"
  // instead of an alpha abbr - that's fine, the offset is still useful.
  let tz = '';
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(start);
    tz = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    /* very old runtimes - fall through with no abbr */
  }
  return tz
    ? `${date}, ${startTime} - ${endTime} ${tz}`
    : `${date}, ${startTime} - ${endTime}`;
}

export function getExplorerTxUrl(signature: string): string {
  return `${EXPLORER_URL}/tx/${signature}?cluster=${SOLANA_CLUSTER}`;
}

export const statusStyles: Record<string, { bgcolor: string; color: string }> = {
  UPCOMING: {
    bgcolor: darkTokens.hover.default,
    color: darkTokens.text.tertiary,
  },
  JOINING: {
    bgcolor: withAlpha(darkTokens.up, 0.10),
    color: darkTokens.up,
  },
  ACTIVE: {
    bgcolor: withAlpha(darkTokens.accent, 0.10),
    color: darkTokens.draw,
  },
  RESOLVED: {
    bgcolor: darkTokens.hover.default,
    color: darkTokens.text.tertiary,
  },
  CLAIMABLE: {
    bgcolor: withAlpha(darkTokens.gain, 0.12),
    color: darkTokens.gain,
  },
};
