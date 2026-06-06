'use client';

import { useState } from 'react';
import {
  Box, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, StatCard, StatusChip, ActionButton,
  LoadingState, EmptyState, ErrorAlert,
  WalletCell, TimeCell, Body, Meta, Label,
  POLL_MEDIUM_MS,
} from '../ui';

interface UserOverviewData {
  data: { totalUsers: number; totalBets: number; activeToday: number };
}

interface TopUsersData {
  data: {
    byVolume: Array<{ walletAddress: string; totalWagered: string; totalBets: number; totalWins: number; level: number }>;
    byWins: Array<{ walletAddress: string; totalWins: number; totalBets: number; level: number }>;
    byLevel: Array<{ walletAddress: string; level: number; totalXp: string; totalBets: number }>;
  };
}

interface UserSearchData {
  data: {
    profile: {
      walletAddress: string;
      level: number;
      totalXp: string;
      coinsBalance: string;
      // Plan §3.6: coinsLifetime and feeBps were never read by the UI;
      // keep them off the type so a future renderer doesn't accidentally
      // start trusting backend data we don't display.
      totalBets: number;
      totalWins: number;
      totalWagered: string;
      currentStreak: number;
      bestStreak: number;
      feePercent: string;
      createdAt: string;
    };
    aggregates: {
      totalWagered: string;
      totalPayout: string;
      wins: number;
      losses: number;
    };
    recentBets: Array<{
      id: string;
      side: string;
      amount: string;
      claimed: boolean;
      payoutAmount: string | null;
      createdAt: string;
      isWinner: boolean;
      pool: {
        id: string;
        asset: string;
        interval: string;
        status: string;
        winner: string | null;
        endTime: string;
      };
    }>;
  };
}

function formatUsdc(raw: string): string {
  return (Number(raw) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function UserOverview() {
  const [searchInput, setSearchInput] = useState('');
  const [searchWallet, setSearchWallet] = useState('');

  const { data: overview, isLoading: ol } = useQuery({
    queryKey: ['admin-users-overview'],
    queryFn: () => adminFetch<UserOverviewData>('/users/overview'),
    refetchInterval: POLL_MEDIUM_MS,
  });

  const { data: top, isLoading: tl } = useQuery({
    queryKey: ['admin-users-top'],
    queryFn: () => adminFetch<TopUsersData>('/users/top'),
  });

  const { data: searchResult, isLoading: sl, error: searchError } = useQuery({
    queryKey: ['admin-user-search', searchWallet],
    queryFn: () => adminFetch<UserSearchData>(`/users/search?wallet=${searchWallet}`),
    enabled: searchWallet.length >= 32,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim().length >= 32) setSearchWallet(searchInput.trim());
  };

  const handleClickWallet = (wallet: string) => {
    setSearchInput(wallet);
    setSearchWallet(wallet);
  };

  if (ol || tl) return <LoadingState variant="block" />;
  const o = overview!.data;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ─── Wallet search ──────────────────────────────────────────── */}
      <SectionCard dense title="Find user">
        <Box component="form" onSubmit={handleSearch} sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Paste a wallet address (32+ chars)…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            InputProps={{ sx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8rem' } }}
          />
          <ActionButton
            kind="primary"
            type="submit"
            label="Search"
            icon={<SearchIcon sx={{ fontSize: 16 }} />}
            disabled={searchInput.trim().length < 32}
            loading={sl && searchWallet.length >= 32}
          />
        </Box>
      </SectionCard>

      {searchError && (
        <ErrorAlert
          title="User search failed"
          message={(searchError as Error).message}
          details={searchError}
        />
      )}

      {/* ─── Search result profile ──────────────────────────────────── */}
      {searchResult && (
        <SectionCard accentColor={t.warning} title="User profile">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>
            <ProfileField label="Wallet">
              <WalletCell address={searchResult.data.profile.walletAddress} />
            </ProfileField>
            <ProfileField label="Level"><Body sx={{ fontWeight: 600, color: t.text.primary }}>{searchResult.data.profile.level}</Body></ProfileField>
            <ProfileField label="XP"><Body>{searchResult.data.profile.totalXp}</Body></ProfileField>
            <ProfileField label="Fee rate"><Body>{searchResult.data.profile.feePercent}</Body></ProfileField>
            <ProfileField label="Coins balance"><Body>{searchResult.data.profile.coinsBalance}</Body></ProfileField>
            <ProfileField label="Total wagered"><Body>{formatUsdc(searchResult.data.aggregates.totalWagered)} USDC</Body></ProfileField>
            <ProfileField label="Total payout"><Body>{formatUsdc(searchResult.data.aggregates.totalPayout)} USDC</Body></ProfileField>
            <ProfileField label="W / L">
              <Body>
                <Box component="span" sx={{ color: t.gain }}>{searchResult.data.aggregates.wins}W</Box>
                {' / '}
                <Box component="span" sx={{ color: t.error }}>{searchResult.data.aggregates.losses}L</Box>
              </Body>
            </ProfileField>
            <ProfileField label="Streak"><Body>{searchResult.data.profile.currentStreak} (best: {searchResult.data.profile.bestStreak})</Body></ProfileField>
            <ProfileField label="Joined"><TimeCell value={searchResult.data.profile.createdAt} mode="datetime" /></ProfileField>
          </Box>

          {searchResult.data.recentBets.length > 0 ? (
            <>
              <Label sx={{ display: 'block', mb: 1 }}>Recent bets ({searchResult.data.recentBets.length})</Label>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><Label>Date</Label></TableCell>
                      <TableCell><Label>Asset</Label></TableCell>
                      <TableCell><Label>Interval</Label></TableCell>
                      <TableCell><Label>Side</Label></TableCell>
                      <TableCell><Label>Amount</Label></TableCell>
                      <TableCell><Label>Result</Label></TableCell>
                      <TableCell><Label>Payout</Label></TableCell>
                      <TableCell><Label>Claimed</Label></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {searchResult.data.recentBets.map(b => (
                      <TableRow key={b.id} hover>
                        <TableCell><TimeCell value={b.createdAt} mode="datetime" /></TableCell>
                        <TableCell>{b.pool.asset}</TableCell>
                        <TableCell>{b.pool.interval}</TableCell>
                        <TableCell>
                          <StatusChip
                            status={b.side === 'UP' ? 'ok' : b.side === 'DOWN' ? 'error' : 'warning'}
                            label={b.side}
                          />
                        </TableCell>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatUsdc(b.amount)}</TableCell>
                        <TableCell>
                          {b.pool.winner
                            ? <StatusChip status={b.isWinner ? 'ok' : 'error'} label={b.isWinner ? 'Won' : 'Lost'} />
                            : <StatusChip status="pending" label={b.pool.status} />
                          }
                        </TableCell>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{b.payoutAmount ? formatUsdc(b.payoutAmount) : '-'}</TableCell>
                        <TableCell>{b.claimed ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            <EmptyState title="No bets yet" hint="This wallet has registered but hasn’t placed a bet." />
          )}
        </SectionCard>
      )}

      {/* ─── Overview tiles ─────────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
        <StatCard label="Total users" value={o.totalUsers.toLocaleString()} />
        <StatCard label="Total bets" value={o.totalBets.toLocaleString()} />
        <StatCard label="Active today" value={o.activeToday.toLocaleString()} hint="Distinct wallets that placed a bet in the last 24h" />
      </Box>

      {/* ─── Top users ──────────────────────────────────────────────── */}
      {top && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
          <SectionCard dense title="Top by volume">
            <TopUsersTable
              users={top.data.byVolume}
              columns={[
                { label: 'Wallet', render: u => <WalletCell address={u.walletAddress} /> },
                { label: 'Volume', render: u => formatUsdc(u.totalWagered), numeric: true },
                { label: 'Lvl', render: u => u.level },
              ]}
              onPickWallet={handleClickWallet}
            />
          </SectionCard>

          <SectionCard dense title="Top by wins">
            <TopUsersTable
              users={top.data.byWins}
              columns={[
                { label: 'Wallet', render: u => <WalletCell address={u.walletAddress} /> },
                { label: 'Wins', render: u => u.totalWins },
                { label: 'Bets', render: u => u.totalBets },
              ]}
              onPickWallet={handleClickWallet}
            />
          </SectionCard>

          <SectionCard dense title="Top by level">
            <TopUsersTable
              users={top.data.byLevel}
              columns={[
                { label: 'Wallet', render: u => <WalletCell address={u.walletAddress} /> },
                { label: 'Level', render: u => u.level },
                { label: 'XP', render: u => u.totalXp, numeric: true },
              ]}
              onPickWallet={handleClickWallet}
            />
          </SectionCard>
        </Box>
      )}
    </Box>
  );
}

function ProfileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Meta sx={{ display: 'block', mb: 0.25 }}>{label}</Meta>
      {children}
    </Box>
  );
}

interface TopColumn<U> { label: string; render: (u: U) => React.ReactNode; numeric?: boolean }

function TopUsersTable<U extends { walletAddress: string }>({
  users, columns, onPickWallet,
}: {
  users: U[];
  columns: Array<TopColumn<U>>;
  onPickWallet: (wallet: string) => void;
}) {
  if (users.length === 0) return <EmptyState title="No data" hint="No users in this ranking yet." />;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>{columns.map(c => <TableCell key={c.label}><Label>{c.label}</Label></TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {users.map(u => (
            <TableRow
              key={u.walletAddress}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => onPickWallet(u.walletAddress)}
            >
              {columns.map(c => (
                <TableCell key={c.label} sx={c.numeric ? { fontVariantNumeric: 'tabular-nums' } : undefined}>
                  {c.render(u)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
