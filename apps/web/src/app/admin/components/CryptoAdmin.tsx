'use client';

import { useMemo, useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, StatCard, LoadingState, EmptyState, ErrorState, Paginator, POLL_MEDIUM_MS } from '../ui';
import { EventBots } from './EventBots';
import { CryptoWinnerShareCard, type CryptoWinnerCardData } from './CryptoWinnerShareCard';

const CYAN = '#5FD8EF';
const PAGE = 50;

interface CUser { walletAddress: string; displayName: string | null; email: string | null; signupIp: string | null; banned: boolean; funded: boolean; createdAt: string; bets: number; flags: string[] }
interface Winner { id: string; weekStart: string; rank: number; prize: number; walletAddress: string; displayName: string | null; email: string | null; payoutWallet: string | null; pnl: string; paid: boolean; paidAt: string | null; paidTx: string | null }
interface RefWinner { id: string; weekStart: string; rank: number; prize: number; walletAddress: string; displayName: string | null; email: string | null; payoutWallet: string | null; validReferrals: number; paid: boolean; paidAt: string | null; paidTx: string | null }
interface RefEntry { walletAddress: string; displayName: string | null; email: string | null; joinedAt: string; bets: number; suspect: boolean; suspectReason: string | null; banned: boolean; active: boolean; valid: boolean }
interface RefGroup { referrer: { walletAddress: string; displayName: string | null; email: string | null; banned: boolean }; total: number; valid: number; referred: RefEntry[] }
interface Overview { users: number; funded: number; banned: number; bets: number; weeklyParticipants: number }

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const fmtPnl = (raw: string) => { const n = Number(raw) / 1_000_000; return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };

export function CryptoAdmin() {
  const [search, setSearch] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [shareCard, setShareCard] = useState<CryptoWinnerCardData | null>(null);

  const q = search.trim().toLowerCase();
  const overviewQ = useQuery({ queryKey: ['crypto-admin-overview'], queryFn: () => adminFetch<{ data: Overview }>('/crypto'), refetchInterval: POLL_MEDIUM_MS });
  const usersQ = useQuery({
    queryKey: ['crypto-admin-users', q, flaggedOnly, page],
    queryFn: () => adminFetch<{ data: CUser[]; total: number }>(`/crypto/users?offset=${page * PAGE}&limit=${PAGE}&search=${encodeURIComponent(q)}&flaggedOnly=${flaggedOnly}`),
  });
  const winnersQ = useQuery({ queryKey: ['crypto-admin-winners'], queryFn: () => adminFetch<{ data: Winner[] }>('/crypto/winners'), refetchInterval: POLL_MEDIUM_MS });
  const refWinnersQ = useQuery({ queryKey: ['crypto-admin-referral-winners'], queryFn: () => adminFetch<{ data: RefWinner[] }>('/crypto/referral-winners'), refetchInterval: POLL_MEDIUM_MS });
  const refTreeQ = useQuery({ queryKey: ['crypto-admin-referrals'], queryFn: () => adminFetch<{ data: RefGroup[] }>('/crypto/referrals'), refetchInterval: POLL_MEDIUM_MS });

  const ov = overviewQ.data?.data;
  const rows = usersQ.data?.data ?? [];
  const total = usersQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const winners = winnersQ.data?.data ?? [];
  const refWinners = refWinnersQ.data?.data ?? [];
  const refTree = refTreeQ.data?.data ?? [];

  // Weeks run Monday 00:00 UTC → Monday 00:00 UTC, the same boundary the API uses
  // (weekStartUtc). The picker defaults to the last CLOSED week: closing the week
  // that just ended is what this button is for, and drawing the one in progress
  // only snapshots a partial board.
  const weekOptions = useMemo(() => {
    const mondayUtc = (d: Date) => {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dow = x.getUTCDay(); // 0=Sun..6=Sat
      x.setUTCDate(x.getUTCDate() - (dow === 0 ? 6 : dow - 1));
      return x;
    };
    const current = mondayUtc(new Date());
    return Array.from({ length: 8 }, (_, i) => {
      const ws = new Date(current.getTime() - i * 7 * 86_400_000);
      const end = new Date(ws.getTime() + 6 * 86_400_000);
      return {
        value: ws.toISOString(),
        label: `${ws.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}${i === 0 ? ' (in progress)' : ''}`,
      };
    });
  }, []);
  const [weekStart, setWeekStart] = useState(() => {
    const mondayUtc = (d: Date) => {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dow = x.getUTCDay();
      x.setUTCDate(x.getUTCDate() - (dow === 0 ? 6 : dow - 1));
      return x;
    };
    return new Date(mondayUtc(new Date()).getTime() - 7 * 86_400_000).toISOString();
  });
  const weekLabel = weekOptions.find((w) => w.value === weekStart)?.label ?? weekStart.slice(0, 10);

  const drawRefWinner = async () => {
    if (busy) return;
    if (!window.confirm(`Draw the referral podium for week ${weekLabel} and announce on Telegram?`)) return;
    setBusy('ref-draw');
    try { const r = await adminFetch<{ data: { count: number; note?: string } }>('/crypto/referral-draw', { method: 'POST', body: JSON.stringify({ weekStart }) }); await refWinnersQ.refetch(); if (!r.data.count) window.alert(r.data.note ?? 'No referral winner for that week.'); }
    catch (e) { window.alert((e as Error).message); } finally { setBusy(null); }
  };
  const setRefPaid = async (w: RefWinner) => {
    if (busy) return;
    let tx: string | undefined;
    if (!w.paid) { const p = window.prompt('Payout tx signature / reference (optional):', ''); if (p === null) return; tx = p.trim() || undefined; }
    else if (!window.confirm('Mark this prize as NOT paid?')) return;
    setBusy(w.id);
    try { await adminFetch(`/crypto/referral-winner/${w.id}/paid`, { method: 'POST', body: JSON.stringify({ paid: !w.paid, ...(tx ? { tx } : {}) }) }); await refWinnersQ.refetch(); }
    catch (e) { window.alert((e as Error).message); } finally { setBusy(null); }
  };

  const toggleBan = async (u: CUser) => {
    if (busy) return;
    if (!u.banned && !window.confirm(`Ban ${u.email ?? short(u.walletAddress)}? Blocks the account across the app.`)) return;
    setBusy(u.walletAddress);
    try { await adminFetch(`/crypto/user/${u.walletAddress}/ban`, { method: 'POST', body: JSON.stringify({ banned: !u.banned }) }); await usersQ.refetch(); await overviewQ.refetch(); }
    catch (e) { window.alert((e as Error).message); } finally { setBusy(null); }
  };

  const drawWinner = async () => {
    if (busy) return;
    if (!window.confirm(`Draw the PNL podium for week ${weekLabel} and announce on Telegram?`)) return;
    setBusy('draw');
    // The endpoint returns { winners, count, note } — read `count`. Reading a
    // `winner` field that stopped existing when the podium became tiered made it
    // report "No winner" on every successful draw.
    try { const r = await adminFetch<{ data: { count: number; note?: string } }>('/crypto/draw', { method: 'POST', body: JSON.stringify({ weekStart }) }); await winnersQ.refetch(); if (!r.data.count) window.alert(r.data.note ?? 'No winner for that week.'); }
    catch (e) { window.alert((e as Error).message); } finally { setBusy(null); }
  };

  const setPaid = async (w: Winner) => {
    if (busy) return;
    let tx: string | undefined;
    if (!w.paid) { const p = window.prompt('Payout tx signature / reference (optional):', ''); if (p === null) return; tx = p.trim() || undefined; }
    else if (!window.confirm('Mark this prize as NOT paid?')) return;
    setBusy(w.id);
    try { await adminFetch(`/crypto/winner/${w.id}/paid`, { method: 'POST', body: JSON.stringify({ paid: !w.paid, ...(tx ? { tx } : {}) }) }); await winnersQ.refetch(); }
    catch (e) { window.alert((e as Error).message); } finally { setBusy(null); }
  };

  const exportCsv = async () => {
    const all = await adminFetch<{ data: CUser[] }>(`/crypto/users?offset=0&limit=100000&search=${encodeURIComponent(q)}&flaggedOnly=${flaggedOnly}`);
    const head = ['wallet', 'displayName', 'email', 'signupIp', 'banned', 'funded', 'bets', 'flags', 'createdAt'];
    const lines = [head.join(',')].concat((all.data ?? []).map((u) => [u.walletAddress, u.displayName ?? '', u.email ?? '', u.signupIp ?? '', u.banned, u.funded, u.bets, u.flags.join('|'), u.createdAt].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'crypto-event-users.csv'; a.click();
  };

  const flagChip = (f: string) => (
    <Box key={f} component="span" sx={{ display: 'inline-block', px: 0.6, py: 0.1, mr: 0.4, borderRadius: 0.75, fontSize: '0.62rem', fontWeight: 700, bgcolor: `${t.warning}22`, color: t.warning }}>{f}</Box>
  );
  const btn = (label: string, onClick: () => void, opts?: { primary?: boolean; danger?: boolean; disabled?: boolean }) => (
    <Box component="button" onClick={onClick} disabled={opts?.disabled} sx={{ px: 1.5, py: 0.55, borderRadius: 1, fontSize: '0.72rem', fontWeight: 800, cursor: opts?.disabled ? 'default' : 'pointer', border: opts?.primary ? 'none' : `1px solid ${t.border.medium}`, bgcolor: opts?.primary ? CYAN : 'transparent', color: opts?.danger ? t.error : opts?.primary ? '#04121a' : t.text.primary, opacity: opts?.disabled ? 0.5 : 1, fontFamily: 'inherit' }}>{label}</Box>
  );

  const inputSx = { px: 1, py: 0.5, borderRadius: 1, fontSize: '0.8rem', border: `1px solid ${t.border.medium}`, bgcolor: t.bg.app, color: t.text.primary, fontFamily: 'inherit', outline: 'none' } as const;

  /** Week selector shared by both podium draws. */
  const weekPicker = (
    <Box
      component="select"
      value={weekStart}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWeekStart(e.target.value)}
      sx={{ ...inputSx, fontSize: '0.72rem', cursor: 'pointer' }}
    >
      {weekOptions.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
    </Box>
  );
  const drawActions = (onDraw: () => void, busyKey: string) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {weekPicker}
      {btn('Draw week', onDraw, { primary: true, disabled: busy === busyKey })}
    </Box>
  );
  const th = { color: t.text.tertiary, fontSize: '0.68rem', fontWeight: 700, borderColor: t.border.subtle, py: 1 } as const;
  const td = { color: t.text.primary, fontSize: '0.78rem', borderColor: t.border.subtle, py: 0.75 } as const;

  if (overviewQ.isLoading) return <LoadingState variant="block" />;
  if (overviewQ.error) return <ErrorState title="Couldn’t load Crypto event admin" message={(overviewQ.error as Error).message} onRetry={() => overviewQ.refetch()} />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Event bots */}
      <EventBots />

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1.5 }}>
        <StatCard label="Participants" value={ov?.users ?? 0} />
        <StatCard label="Funded" value={ov?.funded ?? 0} />
        <StatCard label="Banned" value={ov?.banned ?? 0} color={t.error} />
        <StatCard label="Crypto bets" value={ov?.bets ?? 0} />
        <StatCard label="This week" value={ov?.weeklyParticipants ?? 0} />
      </Box>

      {/* Weekly winners */}
      <SectionCard title="Weekly $100 winner" accentColor={t.gold} actions={drawActions(drawWinner, 'draw')}>
        {winnersQ.isLoading ? <LoadingState variant="inline" /> : winners.length === 0 ? (
          <EmptyState title="No winners drawn yet" hint="Pick a finished week and draw it to snapshot the PNL podium." />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow>
                {['Week', '#', 'Prize', 'Winner', 'Email', 'Payout wallet', 'PNL', 'Paid', ''].map((h) => <TableCell key={h} sx={th}>{h}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>
                {winners.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell sx={td}>{w.weekStart.slice(0, 10)}</TableCell>
                    <TableCell sx={{ ...td, fontWeight: 800, color: w.rank <= 3 ? t.gold : t.text.secondary }}>{w.rank}</TableCell>
                    <TableCell sx={{ ...td, fontWeight: 700 }}>${w.prize}</TableCell>
                    <TableCell sx={{ ...td, fontFamily: 'monospace' }}>{w.displayName || short(w.walletAddress)}</TableCell>
                    <TableCell sx={td}>{w.email ?? '—'}</TableCell>
                    <TableCell sx={td}>
                      {w.payoutWallet ? (
                        <Box component="span" title={`${w.payoutWallet} (click to copy)`} onClick={() => navigator.clipboard?.writeText(w.payoutWallet!)} sx={{ fontFamily: 'monospace', cursor: 'pointer', color: t.text.primary, '&:hover': { color: t.gold } }}>{short(w.payoutWallet)}</Box>
                      ) : <Box component="span" sx={{ color: t.warning }}>not submitted</Box>}
                    </TableCell>
                    <TableCell sx={{ ...td, color: t.success, fontWeight: 700 }}>{fmtPnl(w.pnl)}</TableCell>
                    <TableCell sx={td}>{w.paid ? <Box component="span" sx={{ color: t.success, fontWeight: 700 }}>Paid</Box> : <Box component="span" sx={{ color: t.warning }}>Pending</Box>}</TableCell>
                    <TableCell sx={td}>
                      <Box sx={{ display: 'flex', gap: 0.75 }}>
                        {btn('Share', () => setShareCard({ kind: 'prediction', rank: w.rank, displayName: w.displayName, email: w.email, walletAddress: w.walletAddress, prize: w.prize, weekStart: w.weekStart, pnl: w.pnl }))}
                        {btn(w.paid ? 'Undo' : 'Mark paid', () => setPaid(w), { disabled: busy === w.id, primary: !w.paid })}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      {/* Weekly referral winners */}
      <SectionCard title="Weekly referral winner" accentColor={t.gold} actions={drawActions(drawRefWinner, 'ref-draw')}>
        {refWinnersQ.isLoading ? <LoadingState variant="inline" /> : refWinners.length === 0 ? (
          <EmptyState title="No referral winners drawn yet" hint="Draw the current week to snapshot the top referrer (most valid referrals)." />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow>
                {['Week', '#', 'Prize', 'Referrer', 'Email', 'Payout wallet', 'Valid refs', 'Paid', ''].map((h) => <TableCell key={h} sx={th}>{h}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>
                {refWinners.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell sx={td}>{w.weekStart.slice(0, 10)}</TableCell>
                    <TableCell sx={{ ...td, fontWeight: 800, color: w.rank <= 3 ? t.gold : t.text.secondary }}>{w.rank}</TableCell>
                    <TableCell sx={{ ...td, fontWeight: 700 }}>${w.prize}</TableCell>
                    <TableCell sx={{ ...td, fontFamily: 'monospace' }}>{w.displayName || short(w.walletAddress)}</TableCell>
                    <TableCell sx={td}>{w.email ?? '—'}</TableCell>
                    <TableCell sx={td}>
                      {w.payoutWallet ? (
                        <Box component="span" title={`${w.payoutWallet} (click to copy)`} onClick={() => navigator.clipboard?.writeText(w.payoutWallet!)} sx={{ fontFamily: 'monospace', cursor: 'pointer', color: t.text.primary, '&:hover': { color: t.gold } }}>{short(w.payoutWallet)}</Box>
                      ) : <Box component="span" sx={{ color: t.warning }}>not submitted</Box>}
                    </TableCell>
                    <TableCell sx={{ ...td, fontWeight: 700 }}>{w.validReferrals}</TableCell>
                    <TableCell sx={td}>{w.paid ? <Box component="span" sx={{ color: t.success, fontWeight: 700 }}>Paid</Box> : <Box component="span" sx={{ color: t.warning }}>Pending</Box>}</TableCell>
                    <TableCell sx={td}>
                      <Box sx={{ display: 'flex', gap: 0.75 }}>
                        {btn('Share', () => setShareCard({ kind: 'referral', rank: w.rank, displayName: w.displayName, email: w.email, walletAddress: w.walletAddress, prize: w.prize, weekStart: w.weekStart, validReferrals: w.validReferrals }))}
                        {btn(w.paid ? 'Undo' : 'Mark paid', () => setRefPaid(w), { disabled: busy === w.id, primary: !w.paid })}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      {/* Who referred whom */}
      <SectionCard title="Referrals" subtitle="Who referred whom (event participants)">
        {refTreeQ.isLoading ? <LoadingState variant="inline" /> : refTree.length === 0 ? (
          <EmptyState title="No referrals yet" hint="Referrals appear here once users share their invite link and friends join." />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {refTree.map((g) => (
              <Box key={g.referrer.walletAddress} sx={{ border: `1px solid ${t.border.subtle}`, borderRadius: 1, overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1.25, py: 0.9, bgcolor: `${t.text.primary}08` }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box component="span" sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.text.primary, fontFamily: 'monospace' }}>{g.referrer.displayName || short(g.referrer.walletAddress)}</Box>
                    {g.referrer.banned && <Box component="span" sx={{ ml: 0.75, color: t.error, fontSize: '0.6rem', fontWeight: 800 }}>BANNED</Box>}
                    {g.referrer.email && <Box component="span" sx={{ ml: 0.75, color: t.text.tertiary, fontSize: '0.72rem' }}>{g.referrer.email}</Box>}
                  </Box>
                  <Box component="span" sx={{ flex: 'none', fontSize: '0.72rem', color: t.text.secondary }}>
                    <Box component="span" sx={{ color: t.success, fontWeight: 800 }}>{g.valid}</Box> valid / {g.total} total
                  </Box>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow>{['Referred', 'Email', 'Joined', 'Bets', 'Status'].map((h) => <TableCell key={h} sx={th}>{h}</TableCell>)}</TableRow></TableHead>
                    <TableBody>
                      {g.referred.map((rf) => (
                        <TableRow key={rf.walletAddress}>
                          <TableCell sx={{ ...td, fontFamily: 'monospace' }}>{rf.displayName || short(rf.walletAddress)}</TableCell>
                          <TableCell sx={td}>{rf.email ?? '—'}</TableCell>
                          <TableCell sx={td}>{new Date(rf.joinedAt).toLocaleDateString()}</TableCell>
                          <TableCell sx={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{rf.bets}</TableCell>
                          <TableCell sx={td}>
                            {rf.banned ? <Box component="span" sx={{ color: t.error, fontWeight: 700 }}>Banned</Box>
                              : rf.suspect ? <Box component="span" sx={{ color: t.warning, fontWeight: 700 }} title={rf.suspectReason ?? undefined}>Suspect</Box>
                              : rf.valid ? <Box component="span" sx={{ color: t.success, fontWeight: 700 }}>Valid</Box>
                              : <Box component="span" sx={{ color: t.text.tertiary }}>{rf.active ? 'Pending' : `${rf.bets}/20 bets`}</Box>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ))}
          </Box>
        )}
      </SectionCard>

      {/* Participants */}
      <SectionCard
        title="Participants"
        subtitle={`${total} total`}
        actions={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="input" value={search} placeholder="wallet / email / IP" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearch(e.target.value); setPage(0); }} sx={{ ...inputSx, width: 180 }} />
            <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.72rem', color: t.text.secondary, cursor: 'pointer' }}>
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => { setFlaggedOnly(e.target.checked); setPage(0); }} /> Flagged only
            </Box>
            {btn('Export CSV', exportCsv)}
          </Box>
        }
      >
        {usersQ.isLoading ? <LoadingState variant="inline" /> : rows.length === 0 ? (
          <EmptyState title="No participants" hint="Users appear here once they join the event." />
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow>
                  {['User', 'Email', 'Signup IP', 'Bets', 'Funded', 'Flags', ''].map((h) => <TableCell key={h} sx={th}>{h}</TableCell>)}
                </TableRow></TableHead>
                <TableBody>
                  {rows.map((u) => (
                    <TableRow key={u.walletAddress} sx={u.banned ? { bgcolor: `${t.error}12` } : undefined}>
                      <TableCell sx={{ ...td, fontFamily: 'monospace' }}>{u.displayName || short(u.walletAddress)}{u.banned && <Box component="span" sx={{ ml: 0.5, color: t.error, fontSize: '0.6rem', fontWeight: 800 }}>BANNED</Box>}</TableCell>
                      <TableCell sx={td}>{u.email ?? '—'}</TableCell>
                      <TableCell sx={{ ...td, fontFamily: 'monospace', color: t.text.secondary }}>{u.signupIp ?? '—'}</TableCell>
                      <TableCell sx={td}>{u.bets}</TableCell>
                      <TableCell sx={td}>{u.funded ? '✓' : '—'}</TableCell>
                      <TableCell sx={td}>{u.flags.length ? u.flags.map(flagChip) : <Box component="span" sx={{ color: t.text.quaternary }}>—</Box>}</TableCell>
                      <TableCell sx={td}>{btn(u.banned ? 'Unban' : 'Ban', () => toggleBan(u), { danger: !u.banned, disabled: busy === u.walletAddress })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ mt: 1.5 }}><Paginator page={page} totalPages={totalPages} onChange={setPage} /></Box>
          </>
        )}
      </SectionCard>

      {shareCard && <CryptoWinnerShareCard data={shareCard} onClose={() => setShareCard(null)} />}
    </Box>
  );
}
