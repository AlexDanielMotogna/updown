'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Box, Typography, CircularProgress, Chip, Button, Alert, Avatar } from '@mui/material';
import { EmojiEvents } from '@mui/icons-material';
import Link from 'next/link';
import { fetchTournamentBracket, type TournamentBracket } from '@/lib/api';
import { UP_COLOR, GAIN_COLOR, getAvatarUrl } from '@/lib/constants';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { usePriceStream } from '@/hooks/usePriceStream';
import { useTournamentRegister } from '@/hooks/useTournamentRegister';
import { AppShell } from '@/components';
import { SURFACE, BORDER, MATCH_W, CARD_H, truncate } from '@/components/tournament/tournament-utils';
import { BracketRound, Connectors } from '@/components/tournament/BracketRound';
import { TournamentHeader } from '@/components/tournament/TournamentHeader';
import { TournamentRulesDialog } from '@/components/tournament/TournamentRulesDialog';

export default function TournamentBracketPage() {
  const params = useParams();
  const id = params.id as string;
  const { connected, walletAddress } = useWalletBridge();
  const { register, status: regStatus, error: regError, txSignature: regTx, reset } = useTournamentRegister();

  const [bracket, setBracket] = useState<TournamentBracket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const { getPrice } = usePriceStream(bracket ? [bracket.tournament.asset] : []);

  const load = useCallback(async () => {
    try {
      const res = await fetchTournamentBracket(id, walletAddress || undefined);
      if (res.success && res.data) {
        setBracket(res.data);
        setError(null);
      } else {
        setError(res.error?.message || 'Failed to load bracket');
      }
    } catch {
      setError('Failed to load bracket');
    } finally {
      setLoading(false);
    }
  }, [id, walletAddress]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 5_000);
    return () => clearInterval(iv);
  }, [load]);

  // Drag-to-scroll for bracket area (hooks must be before early returns)
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ isDown: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = { isDown: true, startX: e.pageX, startY: e.pageY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, moved: false };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const ds = dragState.current;
    if (!ds.isDown) return;
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    const walkX = e.pageX - ds.startX;
    const walkY = e.pageY - ds.startY;
    if (Math.abs(walkX) > 3 || Math.abs(walkY) > 3) ds.moved = true;
    el.scrollLeft = ds.scrollLeft - walkX;
    el.scrollTop = ds.scrollTop - walkY;
  }, []);

  const onMouseUp = useCallback(() => {
    dragState.current.isDown = false;
  }, []);

  if (loading) {
    return (
      <AppShell>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 12 }}>
          <CircularProgress size={32} sx={{ color: UP_COLOR }} />
        </Box>
      </AppShell>
    );
  }

  if (error || !bracket) {
    return (
      <AppShell>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, py: 12 }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>{error || 'Tournament not found'}</Typography>
          <Link href="/tournaments" style={{ textDecoration: 'none' }}>
            <Typography sx={{ color: UP_COLOR, fontSize: '0.85rem', '&:hover': { textDecoration: 'underline' } }}>Back to Tournaments</Typography>
          </Link>
        </Box>
      </AppShell>
    );
  }

  const { tournament: t, rounds, participants } = bracket;
  const entryFee = (Number(t.entryFee) / 1_000_000).toFixed(2);
  const prizePool = (Number(t.prizePool) / 1_000_000).toFixed(2);
  const filled = participants?.length ?? 0;
  const isReg = t.status === 'REGISTERING';
  const isActive = t.status === 'ACTIVE';
  const alreadyRegistered = !!(walletAddress && participants?.some(p => p.walletAddress === walletAddress));
  const isBusy = regStatus !== 'idle' && regStatus !== 'success' && regStatus !== 'error';

  const livePrice = getPrice(t.asset);

  const handleRegister = async () => {
    if (regStatus === 'error') reset();
    const ok = await register(id);
    if (ok) load();
  };

  return (
    <AppShell>
    <Box sx={{
      bgcolor: '#0D1219',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 'calc(100vh - 64px)',
      '&::-webkit-scrollbar': { width: 3 },
      '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
      '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 0 },
    }}>

      <TournamentHeader
        tournament={t}
        filled={filled}
        entryFee={entryFee}
        prizePool={prizePool}
        connected={connected}
        walletAddress={walletAddress}
        alreadyRegistered={alreadyRegistered}
        regStatus={regStatus}
        regTx={regTx}
        isBusy={isBusy}
        onRegister={handleRegister}
        onInfoClick={() => setRulesOpen(true)}
      />

      {regError && (
        <Alert severity="error" onClose={() => reset()} sx={{ bgcolor: 'rgba(248,113,113,0.1)', border: 'none', borderRadius: 0 }}>
          {regError}
        </Alert>
      )}

      <TournamentRulesDialog
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        tournament={t}
        entryFee={entryFee}
        prizePool={prizePool}
      />

      {/* ══════ BRACKET VISUALIZATION ══════ */}
      {(() => {
        const totalR = Number(t.totalRounds);
        const size = Number(t.size);
        // Always show all rounds based on tournament size
        const allRounds = Array.from({ length: totalR }, (_, i) => i + 1);
        const isMe = walletAddress === t.winnerWallet;
        const claimed = !!(t as unknown as { prizeClaimedTx?: string }).prizeClaimedTx;

        return (
          <Box
            ref={scrollRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            sx={{
              overflow: 'auto',
              flex: 1,
              px: { xs: 1.5, md: 4 },
              py: { xs: 2, md: 4 },
              cursor: 'grab',
              '&:active': { cursor: 'grabbing' },
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              userSelect: 'none',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'stretch', minWidth: 'max-content', mx: 'auto', maxWidth: 1400 }}>
              {allRounds.map((rn, idx) => {
                const expectedMatches = size / Math.pow(2, rn); // round 1: size/2, round 2: size/4, etc
                const rm = rounds[rn] || [];
                const isLast = idx === allRounds.length - 1;
                return (
                  <Box key={rn} sx={{ display: 'flex', alignItems: 'stretch' }}>
                    <BracketRound
                      roundNum={rn}
                      expectedMatchCount={expectedMatches}
                      matches={rm}
                      totalRounds={totalR}
                      walletAddress={walletAddress}
                      tournamentId={t.id}
                      asset={t.asset}
                      livePrice={livePrice}
                      onRefresh={load}
                    />
                    {!isLast && expectedMatches > 1 && <Connectors matchCount={expectedMatches} roundNum={rn} />}
                  </Box>
                );
              })}

              {/* Champion card — same style as match cards */}
              <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <Box sx={{ height: 20, mb: 2 }} />
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ width: 32, display: 'flex', alignItems: 'center', flexShrink: 0, mx: 0.5 }}>
                    <Box sx={{ width: '100%', borderTop: `1px solid rgba(255,255,255,0.08)` }} />
                  </Box>
                  <Box
                    sx={{
                      width: MATCH_W,
                      height: CARD_H,
                      bgcolor: SURFACE,
                      border: 'none',
                      borderRadius: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      flexShrink: 0,
                    }}
                  >
                    {/* Header — same as match cards */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, borderBottom: `1px solid ${BORDER}` }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Champion
                      </Typography>
                      <EmojiEvents sx={{ fontSize: 16, color: t.winnerWallet ? '#FFD700' : 'rgba(255,255,255,0.08)' }} />
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 0.5, px: 1.5 }}>
                      {t.winnerWallet ? (
                        <>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar src={getAvatarUrl(t.winnerWallet)} sx={{ width: 24, height: 24 }} />
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                              {isMe ? 'You!' : truncate(t.winnerWallet)}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                            ${prizePool} USDC
                          </Typography>
                          {isMe && !claimed && (
                            <Link href="/profile?tab=tournaments" style={{ textDecoration: 'none' }}>
                              <Button size="small" variant="contained" sx={{ bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', px: 2, py: 0.5, borderRadius: 0, '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' } }}>
                                Claim Prize
                              </Button>
                            </Link>
                          )}
                          {claimed && (
                            <Typography variant="caption" sx={{ color: GAIN_COLOR, fontWeight: 600 }}>Claimed</Typography>
                          )}
                        </>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.1)' }}>--</Typography>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        );
      })()}

      {/* (Winner info is now inline in the bracket) */}

      {/* Mobile participants */}
      {!isReg && participants && participants.length > 0 && (
        <Box sx={{ display: { xs: 'block', md: 'none' }, px: 1.5, pb: 4 }}>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
            Participants ({participants.length})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {participants.sort((a, b) => a.seed - b.seed).map((p) => (
              <Chip
                key={p.walletAddress}
                avatar={<Avatar src={getAvatarUrl(p.walletAddress)} sx={{ width: 16, height: 16 }} />}
                label={`#${p.seed} ${truncate(p.walletAddress)}`}
                size="small"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.62rem',
                  height: 22,
                  bgcolor: p.eliminatedRound ? 'rgba(255,255,255,0.02)' : `${UP_COLOR}08`,
                  color: p.eliminatedRound ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)',
                  textDecoration: p.eliminatedRound ? 'line-through' : 'none',
                  '& .MuiChip-avatar': { width: 16, height: 16 },
                }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
    </AppShell>
  );
}
