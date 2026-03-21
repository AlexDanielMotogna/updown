'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, CircularProgress, TextField, Button, Chip, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';

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
      coinsLifetime: string;
      totalBets: number;
      totalWins: number;
      totalWagered: string;
      currentStreak: number;
      bestStreak: number;
      feeBps: number;
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

function WalletCell({ address, onClick }: { address: string; onClick?: () => void }) {
  return (
    <TableCell
      sx={{ fontSize: 11, cursor: onClick ? 'pointer' : undefined, '&:hover': onClick ? { color: '#F59E0B' } : undefined }}
      onClick={onClick}
    >
      {address.slice(0, 6)}...{address.slice(-4)}
    </TableCell>
  );
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
    refetchInterval: 30000,
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

  if (ol || tl) return <CircularProgress />;
  const o = overview!.data;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Search bar */}
      <Card sx={{ p: 2 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search by wallet address..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            sx={{  }}
          />
          <Button type="submit" variant="contained" disabled={searchInput.trim().length < 32} startIcon={<SearchIcon />}>
            Search
          </Button>
        </form>
      </Card>

      {/* Search result */}
      {sl && <CircularProgress size={24} />}
      {searchError && <Alert severity="error">{(searchError as Error).message}</Alert>}
      {searchResult && (
        <Card sx={{ p: 2, border: '1px solid rgba(245,158,11,0.3)' }}>
          <Typography variant="subtitle2" gutterBottom>User Profile</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 1.5, mb: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Wallet</Typography>
              <Typography variant="body2" sx={{ fontSize: 11 }}>{searchResult.data.profile.walletAddress}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Level</Typography>
              <Typography variant="body2" fontWeight={600}>{searchResult.data.profile.level}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">XP</Typography>
              <Typography variant="body2">{searchResult.data.profile.totalXp}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Fee Rate</Typography>
              <Typography variant="body2">{searchResult.data.profile.feePercent}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Coins Balance</Typography>
              <Typography variant="body2">{searchResult.data.profile.coinsBalance}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Total Wagered</Typography>
              <Typography variant="body2">{formatUsdc(searchResult.data.aggregates.totalWagered)} USDC</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Total Payout</Typography>
              <Typography variant="body2">{formatUsdc(searchResult.data.aggregates.totalPayout)} USDC</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">W/L</Typography>
              <Typography variant="body2">
                <span style={{ color: '#22C55E' }}>{searchResult.data.aggregates.wins}W</span>
                {' / '}
                <span style={{ color: '#F87171' }}>{searchResult.data.aggregates.losses}L</span>
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Streak</Typography>
              <Typography variant="body2">{searchResult.data.profile.currentStreak} (best: {searchResult.data.profile.bestStreak})</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Joined</Typography>
              <Typography variant="body2" sx={{ fontSize: 11 }}>{new Date(searchResult.data.profile.createdAt).toLocaleDateString()}</Typography>
            </Box>
          </Box>

          {searchResult.data.recentBets.length > 0 && (
            <>
              <Typography variant="subtitle2" gutterBottom>Recent Bets ({searchResult.data.recentBets.length})</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Asset</TableCell>
                      <TableCell>Interval</TableCell>
                      <TableCell>Side</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Result</TableCell>
                      <TableCell>Payout</TableCell>
                      <TableCell>Claimed</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {searchResult.data.recentBets.map(b => (
                      <TableRow key={b.id}>
                        <TableCell sx={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(b.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{b.pool.asset}</TableCell>
                        <TableCell>{b.pool.interval}</TableCell>
                        <TableCell>
                          <Chip label={b.side} size="small" sx={{ bgcolor: b.side === 'UP' ? '#22C55E22' : '#F8717122', color: b.side === 'UP' ? '#22C55E' : '#F87171', fontSize: 11 }} />
                        </TableCell>
                        <TableCell>{formatUsdc(b.amount)}</TableCell>
                        <TableCell>
                          {b.pool.winner ? (
                            <Chip
                              label={b.isWinner ? 'Won' : 'Lost'}
                              size="small"
                              sx={{ bgcolor: b.isWinner ? '#22C55E22' : '#F8717122', color: b.isWinner ? '#22C55E' : '#F87171', fontSize: 11 }}
                            />
                          ) : (
                            <Chip label={b.pool.status} size="small" sx={{ fontSize: 11 }} variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell>{b.payoutAmount ? formatUsdc(b.payoutAmount) : '—'}</TableCell>
                        <TableCell>{b.claimed ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Card>
      )}

      {/* Overview stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">TOTAL USERS</Typography>
          <Typography variant="h5" fontWeight={600}>{o.totalUsers}</Typography>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">TOTAL BETS</Typography>
          <Typography variant="h5" fontWeight={600}>{o.totalBets}</Typography>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">ACTIVE TODAY</Typography>
          <Typography variant="h5" fontWeight={600}>{o.activeToday}</Typography>
        </Card>
      </Box>

      {/* Top users tables */}
      {top && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
          <Card sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Top by Volume</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Wallet</TableCell><TableCell>Volume</TableCell><TableCell>Lvl</TableCell></TableRow></TableHead>
                <TableBody>
                  {top.data.byVolume.map(u => (
                    <TableRow key={u.walletAddress} hover>
                      <WalletCell address={u.walletAddress} onClick={() => handleClickWallet(u.walletAddress)} />
                      <TableCell>{formatUsdc(u.totalWagered)}</TableCell>
                      <TableCell>{u.level}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          <Card sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Top by Wins</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Wallet</TableCell><TableCell>Wins</TableCell><TableCell>Bets</TableCell></TableRow></TableHead>
                <TableBody>
                  {top.data.byWins.map(u => (
                    <TableRow key={u.walletAddress} hover>
                      <WalletCell address={u.walletAddress} onClick={() => handleClickWallet(u.walletAddress)} />
                      <TableCell>{u.totalWins}</TableCell>
                      <TableCell>{u.totalBets}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          <Card sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Top by Level</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Wallet</TableCell><TableCell>Level</TableCell><TableCell>XP</TableCell></TableRow></TableHead>
                <TableBody>
                  {top.data.byLevel.map(u => (
                    <TableRow key={u.walletAddress} hover>
                      <WalletCell address={u.walletAddress} onClick={() => handleClickWallet(u.walletAddress)} />
                      <TableCell>{u.level}</TableCell>
                      <TableCell>{u.totalXp}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Box>
      )}
    </Box>
  );
}
