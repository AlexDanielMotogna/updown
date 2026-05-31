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

/** "May 29, 10:35 PM – 10:40 PM CEST" — formatted in the viewer's local
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
  // instead of an alpha abbr — that's fine, the offset is still useful.
  let tz = '';
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(start);
    tz = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    /* very old runtimes — fall through with no abbr */
  }
  return tz
    ? `${date}, ${startTime} – ${endTime} ${tz}`
    : `${date}, ${startTime} – ${endTime}`;
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
