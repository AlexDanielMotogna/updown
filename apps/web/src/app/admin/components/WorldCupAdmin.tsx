'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { CheckCircle, EmojiEvents } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, StatCard, LoadingState, EmptyState, ErrorState, Label, POLL_MEDIUM_MS } from '../ui';
import { WinnerShareCard, type WinnerCardData } from './WinnerShareCard';

/** Prize paid per raffle winner (promo is "$100 to 2 people"). */
const WC_PRIZE_PER_WINNER = 50;

const roundLabel = (r: string | null) => r ?? '—';
const PHASE_TAG: Record<string, string> = { REGULATION: "90'", EXTRA_TIME: 'AET', PENALTIES: 'Penalties' };
type Phase = 'REGULATION' | 'EXTRA_TIME' | 'PENALTIES';
const PHASES: { v: Phase; l: string }[] = [{ v: 'REGULATION', l: "90'" }, { v: 'EXTRA_TIME', l: 'ET' }, { v: 'PENALTIES', l: 'Penalties' }];

interface OverviewItem {
  matchId: string; homeTeam: string; awayTeam: string; round: string | null; kickoff: string | null; status: string;
  predictionCount: number; result: { homeScore: number; awayScore: number; phase: Phase } | null; correctCount: number | null; winnerCount: number;
}
interface Pick {
  contestUserId: string;
  homeScore: number; awayScore: number; phase: Phase;
  provider: string | null; xHandle: string | null; email: string | null; displayName: string | null;
  correct: boolean | null; isWinner: boolean;
  payoutWallet: string | null; claimedAt: string | null; paidTx: string | null;
}
interface Detail {
  match: { matchId: string; homeTeam: string; awayTeam: string; round: string | null } | null;
  suggestion: { homeScore: number; awayScore: number; phase: Phase } | null;
  result: { homeScore: number; awayScore: number; phase: Phase; homePens: number | null; awayPens: number | null } | null;
  predictions: Pick[];
}
interface Winner { provider: string | null; xHandle: string | null; email: string | null; displayName: string | null }
interface LlmResult { homeScore: number | null; awayScore: number | null; phase: Phase | null; homePens: number | null; awayPens: number | null; confident: boolean; note?: string }
interface ContestUserRow { id: string; provider: string | null; xHandle: string | null; email: string | null; displayName: string | null; signupIp: string | null; banned: boolean; suspicionReasons: string[]; createdAt: string; predictionCount: number }

const contact = (p: { xHandle: string | null; email: string | null; displayName: string | null }) =>
  p.xHandle ? `@${p.xHandle}` : p.email ?? p.displayName ?? '—';

export function WorldCupAdmin() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-worldcup'],
    queryFn: () => adminFetch<{ data: { matches: OverviewItem[]; contestUsers: number } }>('/worldcup'),
    refetchInterval: POLL_MEDIUM_MS,
  });

  const usersQ = useQuery({
    queryKey: ['admin-worldcup-users'],
    queryFn: () => adminFetch<{ data: ContestUserRow[] }>('/worldcup/users'),
    refetchInterval: POLL_MEDIUM_MS,
  });
  const contestUserRows = usersQ.data?.data ?? [];

  const [selected, setSelected] = useState<string | null>(null);
  const detailQ = useQuery({
    queryKey: ['admin-worldcup-match', selected],
    queryFn: () => adminFetch<{ data: Detail }>(`/worldcup/match/${selected}`),
    enabled: !!selected,
  });

  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [phase, setPhase] = useState<Phase>('REGULATION');
  const [homePens, setHomePens] = useState(0);
  const [awayPens, setAwayPens] = useState(0);
  const [busy, setBusy] = useState(false);
  const [winners, setWinners] = useState<Winner[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cardData, setCardData] = useState<WinnerCardData | null>(null);
  const [banBusy, setBanBusy] = useState<string | null>(null);

  const toggleBan = async (u: ContestUserRow) => {
    if (banBusy) return;
    if (!u.banned && !window.confirm(`Ban ${u.xHandle ? '@' + u.xHandle : u.email ?? 'this account'}? They will be excluded from the raffle.`)) return;
    setBanBusy(u.id);
    try {
      await adminFetch(`/worldcup/contest-user/${u.id}/ban`, { method: 'POST', body: JSON.stringify({ banned: !u.banned }) });
      await usersQ.refetch();
    } catch (e) { window.alert((e as Error).message); } finally { setBanBusy(null); }
  };

  // The detail panel renders below the (long) matches table, so scroll it into view on Manage.
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected) return;
    const id = setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => clearTimeout(id);
  }, [selected]);

  const detail = detailQ.data?.data;
  useEffect(() => {
    const r = detail?.result ?? detail?.suggestion;
    if (r) { setHome(r.homeScore); setAway(r.awayScore); setPhase(r.phase); } else { setHome(0); setAway(0); setPhase('REGULATION'); }
    setHomePens(detail?.result?.homePens ?? 0); setAwayPens(detail?.result?.awayPens ?? 0);
    setWinners(null); setMsg(null);
  }, [detail]);

  if (isLoading) return <LoadingState variant="block" />;
  if (error) return <ErrorState title="Couldn’t load World Cup admin" message={(error as Error).message} details={error} onRetry={() => refetch()} />;

  const matches = data!.data.matches;
  const selectedMatch = selected ? matches.find((m) => m.matchId === selected) : undefined;
  const contestUsers = data!.data.contestUsers;
  const totalPreds = matches.reduce((s, m) => s + m.predictionCount, 0);
  const graded = matches.filter((m) => m.result).length;

  const saveResult = async () => {
    if (!selected) return;
    setBusy(true); setMsg(null);
    try {
      const body = { homeScore: home, awayScore: away, phase, homePens: phase === 'PENALTIES' ? homePens : null, awayPens: phase === 'PENALTIES' ? awayPens : null };
      await adminFetch(`/worldcup/match/${selected}/result`, { method: 'POST', body: JSON.stringify(body) });
      await detailQ.refetch(); refetch(); setMsg('Result saved — picks graded.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const askLlm = async () => {
    if (!selected) return;
    setBusy(true); setMsg('Asking ChatGPT…');
    try {
      const r = await adminFetch<{ data: { result: LlmResult | null; error?: string } }>(`/worldcup/match/${selected}/ask-llm`, { method: 'POST' });
      const res = r.data.result;
      if (!res) { setMsg(r.data.error ?? 'ChatGPT could not find it.'); return; }
      if (res.homeScore != null) setHome(res.homeScore);
      if (res.awayScore != null) setAway(res.awayScore);
      if (res.phase) setPhase(res.phase);
      setHomePens(res.homePens ?? 0); setAwayPens(res.awayPens ?? 0);
      setMsg(`ChatGPT${res.confident ? '' : ' (low confidence)'}: ${res.note ?? 'review and save.'}`);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const runRaffle = async () => {
    if (!selected) return;
    if (!window.confirm('Raffle 2 winners among the correct predictions?')) return;
    setBusy(true); setMsg(null); setWinners(null);
    try {
      const r = await adminFetch<{ data: { winners: Winner[] } }>(`/worldcup/match/${selected}/raffle`, { method: 'POST' });
      setWinners(r.data.winners); await detailQ.refetch(); refetch();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const setPaid = async (contestUserId: string, paid: boolean) => {
    if (!selected || busy) return;
    let paidTx: string | null = null;
    if (paid) {
      const tx = window.prompt('Payout tx signature (leave blank if paid manually):', '');
      if (tx === null) return; // cancelled
      paidTx = tx.trim() || null;
    } else if (!window.confirm('Mark this prize as NOT paid?')) {
      return;
    }
    setBusy(true); setMsg(null);
    try {
      await adminFetch(`/worldcup/match/${selected}/winner/${contestUserId}/paid`, { method: 'POST', body: JSON.stringify({ paid, paidTx }) });
      await detailQ.refetch(); refetch();
      setMsg(paid ? 'Marked as paid.' : 'Marked as unpaid.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const openCard = (p: Pick) => {
    if (!detail?.match) return;
    const r = detail.result;
    setCardData({
      matchId: detail.match.matchId,
      handle: p.xHandle,
      email: p.email,
      displayName: p.displayName,
      homeTeam: detail.match.homeTeam,
      awayTeam: detail.match.awayTeam,
      round: detail.match.round,
      kickoff: selectedMatch?.kickoff ?? null,
      homeScore: r ? r.homeScore : p.homeScore,
      awayScore: r ? r.awayScore : p.awayScore,
      prize: WC_PRIZE_PER_WINNER,
    });
  };

  const inputSx = { width: 56, px: 1, py: 0.6, borderRadius: 1, fontSize: '1rem', textAlign: 'center', border: `1px solid ${t.border.medium}`, bgcolor: t.bg.app, color: t.text.primary, fontFamily: 'inherit', outline: 'none' } as const;
  const btnSx = (primary?: boolean) => ({ px: 2, py: 0.8, borderRadius: 1, fontSize: '0.8rem', fontWeight: 800, cursor: busy ? 'default' : 'pointer', border: primary ? 'none' : `1px solid ${t.border.medium}`, bgcolor: primary ? t.success : t.bg.surfaceAlt, color: primary ? '#000' : t.text.primary, opacity: busy ? 0.6 : 1, '&:hover': { filter: 'brightness(1.1)' } } as const);

  const exportCsv = () => {
    const header = ['Handle', 'Email', 'Provider', 'Joined', 'Picks'];
    const rows = contestUserRows.map((u) => [u.xHandle ? `@${u.xHandle}` : '', u.email ?? '', u.provider ?? '', u.createdAt, String(u.predictionCount)]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'worldcup-contest-users.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2 }}>
        <StatCard label="Contest users" value={contestUsers.toLocaleString()} hint="X / Google / email signups" />
        <StatCard label="Matches" value={matches.length} />
        <StatCard label="Total predictions" value={totalPreds.toLocaleString()} />
        <StatCard label="Graded" value={`${graded}/${matches.length}`} hint="Result confirmed" />
        <StatCard label="Winners drawn" value={matches.reduce((s, m) => s + m.winnerCount, 0)} color={t.gold} />
      </Box>

      <SectionCard title={`Contest users (${contestUserRows.length})${contestUserRows.filter((u) => u.suspicionReasons.length > 0 && !u.banned).length ? ` · ${contestUserRows.filter((u) => u.suspicionReasons.length > 0 && !u.banned).length} flagged` : ''}${contestUserRows.filter((u) => u.banned).length ? ` · ${contestUserRows.filter((u) => u.banned).length} banned` : ''}`}>
        {contestUserRows.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
            <Box component="button" onClick={exportCsv} sx={btnSx(false)}>Export CSV</Box>
          </Box>
        )}
        {usersQ.isLoading ? (
          <LoadingState variant="block" />
        ) : contestUserRows.length === 0 ? (
          <EmptyState title="No contest signups yet" />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>User</Label></TableCell>
                  <TableCell><Label>Provider</Label></TableCell>
                  <TableCell><Label>Joined</Label></TableCell>
                  <TableCell align="right"><Label>Picks</Label></TableCell>
                  <TableCell><Label>Flags</Label></TableCell>
                  <TableCell align="right"><Label>Action</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contestUserRows.map((u) => (
                  <TableRow key={u.id} sx={{ opacity: u.banned ? 0.55 : 1, bgcolor: u.suspicionReasons.length && !u.banned ? `${t.warning}0a` : 'transparent' }}>
                    <TableCell sx={{ color: t.text.primary }}>
                      {u.xHandle ? `@${u.xHandle}` : u.email ?? u.displayName ?? '—'}
                      {u.xHandle && u.email ? <Box component="span" sx={{ color: t.text.tertiary, fontSize: '0.72rem' }}> · {u.email}</Box> : null}
                      {u.banned && <Box component="span" sx={{ ml: 0.75, px: 0.6, py: 0.15, borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, bgcolor: `${t.error}22`, color: t.error }}>BANNED</Box>}
                    </TableCell>
                    <TableCell sx={{ color: t.text.secondary }}>{u.provider ?? '—'}</TableCell>
                    <TableCell sx={{ color: t.text.secondary, whiteSpace: 'nowrap' }}>{new Date(u.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{u.predictionCount}</TableCell>
                    <TableCell>
                      {u.suspicionReasons.length === 0 ? (
                        <Box component="span" sx={{ color: t.text.tertiary }}>—</Box>
                      ) : (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {u.suspicionReasons.map((r) => (
                            <Box key={r} component="span" title={r === 'email-cluster' ? 'Shares an email name-root with other accounts' : r === 'shared-ip' ? `Shares signup IP ${u.signupIp ?? ''} with other accounts` : r}
                              sx={{ px: 0.6, py: 0.15, borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700, bgcolor: `${t.warning}22`, color: t.warning, whiteSpace: 'nowrap' }}>
                              {r}
                            </Box>
                          ))}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Box component="button" disabled={banBusy === u.id} onClick={() => toggleBan(u)}
                        sx={{ px: 1, py: 0.3, borderRadius: 0.75, fontSize: '0.68rem', fontWeight: 700, cursor: banBusy ? 'default' : 'pointer', whiteSpace: 'nowrap', bgcolor: 'transparent', border: `1px solid ${u.banned ? t.border.medium : `${t.error}55`}`, color: u.banned ? t.text.secondary : t.error, opacity: banBusy === u.id ? 0.5 : 1, '&:hover': { bgcolor: u.banned ? t.bg.surfaceAlt : `${t.error}14` } }}>
                        {u.banned ? 'Unban' : 'Ban'}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      <SectionCard title="Matches">
        <Typography sx={{ fontSize: '0.78rem', color: t.text.secondary, mb: 1.5 }}>
          Contest users are separate from the app&apos;s Users tab (a World Cup signup, not a wallet). Click <Box component="span" sx={{ fontWeight: 700, color: t.text.primary }}>Manage</Box> on a match to see who predicted it, set the official result (or use <Box component="span" sx={{ fontWeight: 700, color: t.text.primary }}>Ask ChatGPT</Box>), then <Box component="span" sx={{ fontWeight: 700, color: t.text.primary }}>Raffle 2 winners</Box> among the exact-correct picks.
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><Label>Match</Label></TableCell>
                <TableCell><Label>Round</Label></TableCell>
                <TableCell><Label>Status</Label></TableCell>
                <TableCell align="right"><Label>Picks</Label></TableCell>
                <TableCell><Label>Result</Label></TableCell>
                <TableCell align="right"><Label>Correct</Label></TableCell>
                <TableCell align="right"><Label>Winners</Label></TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {matches.map((m) => (
                <TableRow key={m.matchId} hover selected={selected === m.matchId}>
                  <TableCell sx={{ fontWeight: 600, color: t.text.primary }}>{m.homeTeam} v {m.awayTeam}</TableCell>
                  <TableCell sx={{ color: t.text.secondary }}>{roundLabel(m.round)}</TableCell>
                  <TableCell><Box component="span" sx={{ fontSize: '0.7rem', fontWeight: 700, color: m.status === 'LIVE' ? t.success : m.status === 'FINISHED' ? t.text.tertiary : t.text.secondary }}>{m.status}</Box></TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{m.predictionCount}</TableCell>
                  <TableCell sx={{ color: t.text.secondary }}>{m.result ? `${m.result.homeScore}-${m.result.awayScore} ${PHASE_TAG[m.result.phase]}` : '—'}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: m.correctCount ? t.success : t.text.tertiary }}>{m.correctCount ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: m.winnerCount ? t.gold : t.text.tertiary }}>{m.winnerCount || '—'}</TableCell>
                  <TableCell align="right">
                    <Box component="button" onClick={() => setSelected(selected === m.matchId ? null : m.matchId)}
                      sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', border: `1px solid ${t.border.subtle}`, bgcolor: 'transparent', color: t.text.secondary, '&:hover': { color: t.text.primary } }}>
                      {selected === m.matchId ? 'Close' : 'Manage'}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>

      <Box ref={detailRef} sx={{ scrollMarginTop: 16 }} />
      {selected && detailQ.isLoading && (
        <SectionCard title="Loading match…"><LoadingState variant="block" /></SectionCard>
      )}
      {selected && !detailQ.isLoading && detailQ.error && (
        <SectionCard title="Match">
          <ErrorState title="Couldn’t load this match" message={(detailQ.error as Error).message} details={detailQ.error} onRetry={() => detailQ.refetch()} />
        </SectionCard>
      )}
      {selected && detail && (
        <SectionCard title={detail.match ? `${detail.match.homeTeam} v ${detail.match.awayTeam}` : 'Match'}>
          {/* Result editor */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
            <Box>
              <Label>Official result {detail.suggestion && !detail.result ? '(SDB suggested)' : ''}</Label>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Box component="input" type="number" min={0} value={home} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHome(Number(e.target.value))} sx={inputSx} />
                <Typography sx={{ color: t.text.tertiary }}>-</Typography>
                <Box component="input" type="number" min={0} value={away} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAway(Number(e.target.value))} sx={inputSx} />
              </Box>
            </Box>
            <Box>
              <Label>Phase</Label>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                {PHASES.map((p) => (
                  <Box key={p.v} onClick={() => setPhase(p.v)} sx={{ px: 1.5, py: 0.7, borderRadius: 1, cursor: 'pointer', bgcolor: phase === p.v ? t.hover.strong : t.hover.light, color: phase === p.v ? t.text.primary : t.text.tertiary, fontSize: '0.8rem', fontWeight: 700 }}>{p.l}</Box>
                ))}
              </Box>
            </Box>
            {phase === 'PENALTIES' && (
              <Box>
                <Label>Shootout (display)</Label>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  <Box component="input" type="number" min={0} value={homePens} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHomePens(Number(e.target.value))} sx={inputSx} />
                  <Typography sx={{ color: t.text.tertiary }}>-</Typography>
                  <Box component="input" type="number" min={0} value={awayPens} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAwayPens(Number(e.target.value))} sx={inputSx} />
                </Box>
              </Box>
            )}
            <Box component="button" disabled={busy} onClick={askLlm} title="Look up the result with ChatGPT web search" sx={{ ...btnSx(false), mt: 2.5 }}>Ask ChatGPT</Box>
            <Box component="button" disabled={busy} onClick={saveResult} sx={{ ...btnSx(true), mt: 2.5 }}>Save result</Box>
            <Box component="button" disabled={busy || !detail.result} onClick={runRaffle} sx={{ ...btnSx(false), mt: 2.5, opacity: detail.result ? (busy ? 0.6 : 1) : 0.4 }}>Raffle 2 winners</Box>
          </Box>

          {msg && <Typography sx={{ fontSize: '0.8rem', color: t.text.secondary, mb: 2 }}>{msg}</Typography>}

          {winners && (
            <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: `${t.gold}14`, border: `1px solid ${t.gold}44` }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: t.gold, mb: 0.5 }}>🏆 Winners</Typography>
              {winners.length === 0 ? <Typography sx={{ fontSize: '0.8rem', color: t.text.secondary }}>No correct predictions.</Typography>
                : winners.map((w, i) => <Typography key={i} sx={{ fontSize: '0.85rem', color: t.text.primary }}>{contact(w)}{w.email && w.xHandle ? ` · ${w.email}` : ''}</Typography>)}
            </Box>
          )}

          {/* Predictions */}
          {detail.predictions.length === 0 ? (
            <EmptyState title="No predictions for this match yet" />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><Label>User</Label></TableCell>
                    <TableCell><Label>Pick</Label></TableCell>
                    <TableCell align="center"><Label>Correct</Label></TableCell>
                    <TableCell align="center"><Label>Winner</Label></TableCell>
                    <TableCell><Label>Payout wallet</Label></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.predictions.map((p, i) => (
                    <TableRow key={i} sx={{ bgcolor: p.correct ? `${t.success}0f` : 'transparent' }}>
                      <TableCell sx={{ color: t.text.primary }}>{contact(p)}{p.xHandle && p.email ? <Box component="span" sx={{ color: t.text.tertiary, fontSize: '0.72rem' }}> · {p.email}</Box> : null}</TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums', color: t.text.secondary }}>{p.homeScore}-{p.awayScore} {PHASE_TAG[p.phase]}</TableCell>
                      <TableCell align="center">{p.correct == null ? '—' : p.correct ? <CheckCircle sx={{ fontSize: 16, color: t.success }} /> : ''}</TableCell>
                      <TableCell align="center">{p.isWinner ? <EmojiEvents sx={{ fontSize: 16, color: t.gold }} /> : ''}</TableCell>
                      <TableCell>
                        {!p.isWinner ? (
                          <Box component="span" sx={{ color: t.text.tertiary }}>—</Box>
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {p.payoutWallet ? (
                              <Box
                                component="span"
                                title={`${p.payoutWallet}\nClick to copy`}
                                onClick={() => navigator.clipboard?.writeText(p.payoutWallet!)}
                                sx={{ fontFamily: 'monospace', fontSize: '0.72rem', color: t.text.primary, cursor: 'pointer', '&:hover': { color: t.gold } }}
                              >
                                {p.payoutWallet.slice(0, 4)}…{p.payoutWallet.slice(-4)}
                              </Box>
                            ) : (
                              <Box component="span" sx={{ color: t.warning, fontSize: '0.72rem' }}>Not submitted</Box>
                            )}
                            {p.paidTx ? (
                              <>
                                <Box component="span" title={p.paidTx} sx={{ color: t.success, fontSize: '0.72rem', fontWeight: 800 }}>Paid</Box>
                                <Box component="span" onClick={() => setPaid(p.contestUserId, false)} sx={{ color: t.text.tertiary, fontSize: '0.66rem', cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: t.text.secondary } }}>undo</Box>
                              </>
                            ) : (
                              <Box
                                component="span"
                                onClick={() => setPaid(p.contestUserId, true)}
                                sx={{ ml: 'auto', px: 1, py: 0.3, borderRadius: 0.75, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${t.border.medium}`, color: t.text.primary, opacity: busy ? 0.5 : 1, '&:hover': { bgcolor: t.bg.surfaceAlt } }}
                              >
                                Mark paid
                              </Box>
                            )}
                            <Box
                              component="span"
                              onClick={() => openCard(p)}
                              title="Generate a shareable winner card (PNG) for X"
                              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, px: 1, py: 0.3, borderRadius: 0.75, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${t.gold}55`, color: t.gold, '&:hover': { bgcolor: `${t.gold}14` } }}
                            >
                              <EmojiEvents sx={{ fontSize: 13 }} /> Card
                            </Box>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </SectionCard>
      )}

      {cardData && <WinnerShareCard data={cardData} onClose={() => setCardData(null)} />}
    </Box>
  );
}
