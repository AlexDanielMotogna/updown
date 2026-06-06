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
import { UpIcon } from '@/components/UpIcon';
import {
  SectionCard, StatCard, LoadingState, EmptyState, ErrorState,
  IdCell, TimeCell, Label, POLL_MEDIUM_MS,
} from '../ui';

interface ReferredUser {
  referralId: string;
  walletAddress: string;
  displayName: string | null;
  settledBets: number;
  totalBets: number;
  lastActiveDate: string | null;
  active: boolean;
  suspect: boolean;
  suspectReason: string | null;
  reviewed: boolean;
  signupIp: string | null;
  deviceFingerprint: string | null;
}
interface Referrer {
  referrerWallet: string;
  displayName: string | null;
  referredCount: number;
  activeReferredCount: number;
  suspectCount: number;
  referred: ReferredUser[];
}
interface GrowthData {
  data: {
    summary: { totalUsers: number; activeUsers: number; totalReferred: number; activeReferred: number; suspectReferred: number; activeThreshold: number };
    referrers: Referrer[];
  };
}
interface PrizeRow {
  rank: number;
  walletAddress: string;
  displayName: string | null;
  validReferrals: number;
  prize: number;
  status: string;
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
  const [prizeRows, setPrizeRows] = useState<PrizeRow[] | null>(null);
  const [prizeBusy, setPrizeBusy] = useState(false);
  const [prizeDryRun, setPrizeDryRun] = useState(true);

  if (isLoading) return <LoadingState variant="block" />;
  if (error) {
    return <ErrorState title="Couldn’t load growth data" message={(error as Error).message} details={error} onRetry={() => refetch()} />;
  }

  const { summary, referrers } = data!.data;

  const review = async (referralId: string, suspect: boolean) => {
    await adminFetch(`/referrals/${referralId}/review`, { method: 'POST', body: JSON.stringify({ suspect }) });
    refetch();
  };

  const runPrizes = async (dryRun: boolean) => {
    if (!dryRun && !window.confirm('Distribute referral prizes now? This credits UP and cannot be undone.')) return;
    setPrizeBusy(true);
    try {
      const r = await adminFetch<{ data: { dryRun: boolean; results: PrizeRow[] } }>('/referrals/distribute-prizes', {
        method: 'POST', body: JSON.stringify({ dryRun }),
      });
      setPrizeRows(r.data.results);
      setPrizeDryRun(r.data.dryRun);
      if (!dryRun) refetch();
    } finally {
      setPrizeBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2 }}>
        <StatCard label="Total users" value={summary.totalUsers.toLocaleString()} />
        <StatCard label="Active users" value={summary.activeUsers.toLocaleString()} color={t.success} hint={`≥${summary.activeThreshold} real predictions`} />
        <StatCard label="Referred users" value={summary.totalReferred.toLocaleString()} />
        <StatCard label="Active referred" value={summary.activeReferred.toLocaleString()} color={t.success} />
        <StatCard label="Suspect referred" value={summary.suspectReferred.toLocaleString()} color={summary.suspectReferred > 0 ? t.error : undefined} hint="Flagged sybil/self-referrals" />
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
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {r.displayName ?? <IdCell value={r.referrerWallet} />}
                            {r.suspectCount > 0 && (
                              <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 700, color: t.error }}>
                                {r.suspectCount} suspect
                              </Box>
                            )}
                          </Box>
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
                                  <Box sx={{ minWidth: 0 }}>
                                    {u.displayName ?? <IdCell value={u.walletAddress} />}
                                    <Box sx={{ display: 'flex', gap: 1.5, mt: 0.2, fontSize: '0.68rem', color: t.text.tertiary, fontFamily: 'monospace' }}>
                                      <Box component="span" title={u.signupIp ?? 'no IP captured'}>IP {u.signupIp ?? '-'}</Box>
                                      <Box component="span" title={u.deviceFingerprint ?? 'no fingerprint captured'}>FP {u.deviceFingerprint ?? '-'}</Box>
                                    </Box>
                                  </Box>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                    <Box sx={{ fontSize: '0.75rem', color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
                                      {u.settledBets} settled / {u.totalBets} bets
                                    </Box>
                                    {u.lastActiveDate ? <TimeCell value={u.lastActiveDate} /> : <Box sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>never</Box>}
                                    {u.suspect && (
                                      <Box component="span" title={u.suspectReason ?? 'Flagged'} sx={{ px: 0.8, py: 0.2, borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, color: t.error, bgcolor: `${t.error}22`, cursor: 'help' }}>
                                        Suspect
                                      </Box>
                                    )}
                                    <ActivePill active={u.active} />
                                    <Box
                                      component="button"
                                      onClick={() => review(u.referralId, !u.suspect)}
                                      sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', border: `1px solid ${t.border.subtle}`, bgcolor: 'transparent', color: t.text.secondary, '&:hover': { color: t.text.primary, borderColor: t.border.medium } }}
                                    >
                                      {u.suspect ? 'Clear' : 'Flag'}
                                    </Box>
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

      <SectionCard title="Referral prizes (top 20)">
        <Box sx={{ display: 'flex', gap: 1, mb: prizeRows ? 2 : 0, flexWrap: 'wrap' }}>
          <Box component="button" disabled={prizeBusy} onClick={() => runPrizes(true)}
            sx={{ px: 2, py: 0.8, borderRadius: 1, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', border: `1px solid ${t.border.medium}`, bgcolor: t.bg.surfaceAlt, color: t.text.primary, '&:hover': { borderColor: t.border.strong } }}>
            Preview payout
          </Box>
          <Box component="button" disabled={prizeBusy} onClick={() => runPrizes(false)}
            sx={{ px: 2, py: 0.8, borderRadius: 1, fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', border: 'none', bgcolor: t.success, color: '#000', opacity: prizeBusy ? 0.6 : 1, '&:hover': { filter: 'brightness(1.1)' } }}>
            Distribute now
          </Box>
        </Box>
        {prizeRows && (
          prizeRows.length === 0 ? (
            <EmptyState title="No eligible referrers for prizes" />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell align="right"><Label>#</Label></TableCell>
                    <TableCell><Label>Referrer</Label></TableCell>
                    <TableCell align="right"><Label>Valid</Label></TableCell>
                    <TableCell align="right"><Label>Prize (UP)</Label></TableCell>
                    <TableCell><Label>Status</Label></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {prizeRows.map((p) => (
                    <TableRow key={p.walletAddress}>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.rank}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                          {p.displayName && <Box sx={{ fontSize: '0.82rem', fontWeight: 600, color: t.text.primary }}>{p.displayName}</Box>}
                          <IdCell value={p.walletAddress} />
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.validReferrals}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: t.gold, fontWeight: 700 }}>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                          {p.prize.toLocaleString()}
                          <UpIcon size={14} />
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: p.status === 'paid' ? t.success : p.status === 'already_paid' ? t.text.tertiary : t.text.secondary, fontSize: '0.75rem', fontWeight: 700 }}>
                        {prizeDryRun ? 'preview' : p.status}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )
        )}
      </SectionCard>
    </Box>
  );
}
