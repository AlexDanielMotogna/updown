'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography } from '@mui/material';
import { Groups, ContentCopy, Check, EmojiEvents } from '@mui/icons-material';
import { fetchCryptoReferrals } from '@/lib/api';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/** Event-native referral: invite link + weekly top-referrer prize + mini board. */
export function ReferralCard() {
  const t = useThemeTokens();
  const { authenticated, getAccessToken } = usePrivy();
  const { walletAddress } = useWalletBridge();
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ['crypto-referrals', walletAddress],
    queryFn: async () => { const token = await getAccessToken(); if (!token || !walletAddress) return null; return fetchCryptoReferrals(token, walletAddress); },
    enabled: authenticated && !!walletAddress,
    refetchInterval: 30_000,
  });
  const r = data?.data;

  const copy = async () => {
    if (!r?.link) return;
    try {
      if (navigator.share) { await navigator.share({ title: 'UpDown Crypto Predictions', text: 'Predict BTC/ETH/SOL and win. Join me:', url: r.link }); return; }
      await navigator.clipboard.writeText(r.link);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { /* user cancelled share / clipboard blocked */ }
  };

  const prize = r?.prizeLabel ?? '$30 / $20 / $10';
  const threshold = r?.activeThreshold ?? 20;

  return (
    <Box sx={{ borderRadius: 1, bgcolor: t.bg.surface, overflow: 'hidden', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: { xs: 1.5, sm: 2 }, py: 1.5, borderBottom: `1px solid ${t.border.subtle}`, color: CYAN }}>
        <Groups sx={{ fontSize: 18 }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', color: t.text.primary }}>INVITE &amp; EARN</Typography>
      </Box>

      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25, px: 1.25, py: 1, borderRadius: 1, bgcolor: `${t.gold}14`, border: `1px solid ${t.gold}40` }}>
          <EmojiEvents sx={{ fontSize: 18, color: t.gold }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.8rem', color: t.text.primary, lineHeight: 1.4 }}>
              Top {r?.prizes?.length ?? 3} referrers win <b style={{ color: t.gold }}>{prize}</b>
            </Typography>
            {r && !r.prizeActive && (
              <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary, lineHeight: 1.35, mt: 0.25 }}>
                Prize activates once <b>{r.minReferrers}</b> people refer players ({r.activeReferrers}/{r.minReferrers}).
              </Typography>
            )}
          </Box>
        </Box>

        {/* Invite link + copy/share */}
        <Box sx={{ display: 'flex', gap: 0.75, mb: 1, minWidth: 0 }}>
          <Box sx={{ flex: 1, minWidth: 0, px: 1.25, py: 0.9, borderRadius: 1, bgcolor: t.bg.app, border: `1px solid ${t.border.medium}`, overflow: 'hidden' }}>
            <Typography noWrap sx={{ fontSize: '0.75rem', color: t.text.secondary, fontFamily: 'monospace' }}>
              {r?.link ? r.link.replace(/^https?:\/\//, '') : 'Loading…'}
            </Typography>
          </Box>
          <Box component="button" onClick={copy} disabled={!r?.link} sx={{ flex: 'none', whiteSpace: 'nowrap', px: 1.5, py: 0.9, borderRadius: 1, border: 'none', cursor: r?.link ? 'pointer' : 'default', bgcolor: CYAN, color: '#04121a', fontWeight: 800, fontSize: '0.76rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
            {copied ? <Check sx={{ fontSize: 16 }} /> : <ContentCopy sx={{ fontSize: 15 }} />}
            {copied ? 'Copied' : 'Share'}
          </Box>
        </Box>
        <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary, mb: 1.5, lineHeight: 1.45 }}>
          A friend counts once they join and place <b>{threshold}</b> predictions.
        </Typography>

        {/* My stats */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <Box sx={{ flex: 1, textAlign: 'center', py: 1, borderRadius: 1, bgcolor: t.bg.app }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 900, color: t.text.primary }}>{r?.myValidReferrals ?? 0}</Typography>
            <Typography sx={{ fontSize: '0.66rem', color: t.text.tertiary }}>Valid referrals</Typography>
          </Box>
          <Box sx={{ flex: 1, textAlign: 'center', py: 1, borderRadius: 1, bgcolor: t.bg.app }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 900, color: r?.myRank ? CYAN : t.text.tertiary }}>{r?.myRank ? `#${r.myRank}` : '—'}</Typography>
            <Typography sx={{ fontSize: '0.66rem', color: t.text.tertiary }}>Your rank</Typography>
          </Box>
        </Box>

        {/* Mini leaderboard */}
        {r && r.board.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, color: t.text.tertiary, letterSpacing: '0.04em', mb: 0.5 }}>THIS WEEK</Typography>
            {r.board.slice(0, 5).map((row) => {
              const me = row.walletAddress === walletAddress;
              return (
                <Box key={row.walletAddress} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderTop: `1px solid ${t.border.subtle}` }}>
                  <Typography sx={{ width: 18, fontSize: '0.78rem', fontWeight: 800, color: row.rank <= 3 ? t.gold : t.text.tertiary }}>{row.rank}</Typography>
                  <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: me ? CYAN : t.text.primary, fontWeight: me ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.displayName || short(row.walletAddress)}{me && ' (you)'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: t.text.primary }}>{row.validReferrals}</Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}
