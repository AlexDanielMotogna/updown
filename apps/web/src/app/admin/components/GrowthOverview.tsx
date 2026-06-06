'use client';

import { useState, Fragment } from 'react';
import {
  Box, Collapse,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, StatCard, LoadingState, EmptyState, ErrorState,
  IdCell, TimeCell, Label, POLL_MEDIUM_MS,
} from '../ui';

interface ReferredUser {
  walletAddress: string;
  displayName: string | null;
  settledBets: number;
  totalBets: number;
  lastActiveDate: string | null;
  active: boolean;
}
interface Referrer {
  referrerWallet: string;
  displayName: string | null;
  referredCount: number;
  activeReferredCount: number;
  referred: ReferredUser[];
}
interface GrowthData {
  data: {
    summary: { totalUsers: number; activeUsers: number; totalReferred: number; activeReferred: number; activeThreshold: number };
    referrers: Referrer[];
  };
}

function ActivePill({ active }: { active: boolean }) {
  return (
    <Box component="span" sx={{
      px: 0.8, py: 0.2, borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
      color: active ? t.success : t.text.tertiary,
      bgcolor: active ? `${t.success}22` : t.hover.medium,
    }}>
      {active ? 'Active' : 'Idle'}
    </Box>
  );
}

export function GrowthOverview() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-growth'],
    queryFn: () => adminFetch<GrowthData>('/referrals'),
    refetchInterval: POLL_MEDIUM_MS,
  });

  if (isLoading) return <LoadingState variant="block" />;
  if (error) {
    return <ErrorState title="Couldn’t load growth data" message={(error as Error).message} details={error} onRetry={() => refetch()} />;
  }

  const { summary, referrers } = data!.data;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <StatCard label="Total users" value={summary.totalUsers.toLocaleString()} />
        <StatCard label="Active users" value={summary.activeUsers.toLocaleString()} color={t.success} hint={`≥${summary.activeThreshold} real predictions`} />
        <StatCard label="Referred users" value={summary.totalReferred.toLocaleString()} />
        <StatCard label="Active referred" value={summary.activeReferred.toLocaleString()} color={t.success} />
      </Box>

      <SectionCard title="Referrers">
        {referrers.length === 0 ? (
          <EmptyState title="No referrals yet" />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>Referrer</Label></TableCell>
                  <TableCell align="right"><Label>Referred</Label></TableCell>
                  <TableCell align="right"><Label>Active</Label></TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {referrers.map((r) => {
                  const open = expanded === r.referrerWallet;
                  return (
                    <Fragment key={r.referrerWallet}>
                      <TableRow
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => setExpanded(open ? null : r.referrerWallet)}
                      >
                        <TableCell>
                          {r.displayName ?? <IdCell value={r.referrerWallet} />}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.referredCount}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: r.activeReferredCount > 0 ? t.success : t.text.tertiary }}>
                          {r.activeReferredCount}
                        </TableCell>
                        <TableCell align="right" sx={{ width: 36 }}>
                          <ExpandMore sx={{ fontSize: 18, color: t.text.secondary, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={4} sx={{ p: 0, border: 'none' }}>
                          <Collapse in={open} unmountOnExit>
                            <Box sx={{ px: 2, py: 1.5, bgcolor: t.bg.app }}>
                              {r.referred.map((u) => (
                                <Box key={u.walletAddress} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.6 }}>
                                  <Box sx={{ minWidth: 0 }}>{u.displayName ?? <IdCell value={u.walletAddress} />}</Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                    <Box sx={{ fontSize: '0.75rem', color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
                                      {u.settledBets} settled / {u.totalBets} bets
                                    </Box>
                                    {u.lastActiveDate ? <TimeCell value={u.lastActiveDate} /> : <Box sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>never</Box>}
                                    <ActivePill active={u.active} />
                                  </Box>
                                </Box>
                              ))}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>
    </Box>
  );
}
