'use client';

/**
 * Table-cell primitives. Centralizes timestamp rendering, click-to-copy
 * IDs / wallets, and short-link patterns that were duplicated across
 * three or more components each.
 *
 * Compact absolute time is the default for tables (sortable, locale-
 * neutral); pass `mode="relative"` for "2m ago" / "3h ago" feedback in
 * activity logs. The same helper drives both - components don't compute
 * times themselves.
 */
import { useState } from 'react';
import { Box, Tooltip, IconButton, Link } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { darkTokens as t } from '@/lib/theme';
import { Meta } from './typography';

// ─── Time formatting ───────────────────────────────────────────────────
export type TimeMode = 'absolute' | 'relative' | 'datetime';

/** Compact `HH:MM` if today, `Mon D` if this year, `YYYY-MM-DD` otherwise. */
function formatAbsolute(d: Date): string {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toISOString().slice(0, 10);
}

function formatRelative(d: Date): string {
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;
  const m = Math.floor(abs / 60_000);
  if (m < 1) return past ? 'just now' : 'in <1m';
  if (m < 60) return past ? `${m}m ago` : `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return past ? `${h}h ago` : `in ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return past ? `${days}d ago` : `in ${days}d`;
  return d.toISOString().slice(0, 10);
}

function formatDateTime(d: Date): string {
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatTime(iso: string | Date | null | undefined, mode: TimeMode = 'absolute'): string {
  if (iso == null) return '-';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  switch (mode) {
    case 'relative': return formatRelative(d);
    case 'datetime': return formatDateTime(d);
    case 'absolute':
    default: return formatAbsolute(d);
  }
}

export interface TimeCellProps {
  value: string | Date | null | undefined;
  mode?: TimeMode;
  /** When the visible mode is compact, hover shows the full ISO. */
  tooltip?: boolean;
}

export function TimeCell({ value, mode = 'absolute', tooltip = true }: TimeCellProps) {
  if (value == null) return <Meta component="span">-</Meta>;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return <Meta component="span">-</Meta>;
  const label = formatTime(d, mode);
  if (!tooltip) return <Box component="span" sx={{ fontSize: '0.75rem', color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>{label}</Box>;
  return (
    <Tooltip title={d.toISOString()} placement="top" arrow>
      <Box component="span" sx={{ fontSize: '0.75rem', color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>{label}</Box>
    </Tooltip>
  );
}

// ─── Copy-to-clipboard helper ──────────────────────────────────────────
function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };
  return { copied, copy };
}

// ─── Generic ID cell ───────────────────────────────────────────────────
export interface IdCellProps {
  value: string;
  truncate?: number;
  copyable?: boolean;
  href?: string;
  /** Open the href in a new tab. Useful when linking from admin → public
   *  surfaces so the operator doesn't lose the admin context. */
  external?: boolean;
}

export function IdCell({ value, truncate, copyable = true, href, external }: IdCellProps) {
  const { copied, copy } = useCopy(value);
  const display = truncate && value.length > truncate
    ? value.slice(0, truncate) + '…'
    : value;
  const monoSx = {
    color: t.text.primary,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.75rem',
  } as const;
  const label = href ? (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      underline="hover"
      sx={{ ...monoSx, textDecorationColor: t.border.medium, '&:hover': { color: t.text.bright } }}
    >
      {display}
    </Link>
  ) : (
    <Box component="span" sx={monoSx}>
      {display}
    </Box>
  );
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
      {label}
      {copyable ? (
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton size="small" onClick={copy} sx={{ p: 0.25, color: t.text.tertiary, '&:hover': { color: t.text.primary } }}>
            {copied ? <CheckIcon sx={{ fontSize: 12 }} /> : <ContentCopyIcon sx={{ fontSize: 12 }} />}
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
}

// ─── Wallet cell (locked to 4+4) ───────────────────────────────────────
export interface WalletCellProps {
  address: string | null | undefined;
  /** Optional override; default is 4+4. */
  length?: number;
  copyable?: boolean;
}

export function WalletCell({ address, length = 4, copyable = true }: WalletCellProps) {
  if (!address) return <Meta component="span">-</Meta>;
  const display = address.length > length * 2 + 1
    ? `${address.slice(0, length)}…${address.slice(-length)}`
    : address;
  const { copied, copy } = useCopy(address);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
      <Tooltip title={address} placement="top">
        <Box component="span" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.75rem', color: t.text.primary }}>
          {display}
        </Box>
      </Tooltip>
      {copyable ? (
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton size="small" onClick={copy} sx={{ p: 0.25, color: t.text.tertiary, '&:hover': { color: t.text.primary } }}>
            {copied ? <CheckIcon sx={{ fontSize: 12 }} /> : <ContentCopyIcon sx={{ fontSize: 12 }} />}
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
}
