import { EXPLORER_URL, SOLANA_CLUSTER } from '@/lib/constants';

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
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getExplorerTxUrl(signature: string): string {
  return `${EXPLORER_URL}/tx/${signature}?cluster=${SOLANA_CLUSTER}`;
}

export const statusStyles: Record<string, { bgcolor: string; color: string }> = {
  UPCOMING: {
    bgcolor: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  JOINING: {
    bgcolor: 'rgba(74, 222, 128, 0.10)',
    color: '#4ADE80',
  },
  ACTIVE: {
    bgcolor: 'rgba(245, 158, 11, 0.10)',
    color: '#FBBF24',
  },
  RESOLVED: {
    bgcolor: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  CLAIMABLE: {
    bgcolor: 'rgba(34, 197, 94, 0.12)',
    color: '#22C55E',
  },
};
