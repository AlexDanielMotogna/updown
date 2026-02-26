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
    bgcolor: 'rgba(255, 255, 255, 0.08)',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  ACTIVE: {
    bgcolor: 'rgba(255, 255, 255, 0.1)',
    color: '#FFFFFF',
  },
  RESOLVED: {
    bgcolor: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  CLAIMABLE: {
    bgcolor: 'rgba(0, 229, 255, 0.1)',
    color: '#00E5FF',
  },
};
