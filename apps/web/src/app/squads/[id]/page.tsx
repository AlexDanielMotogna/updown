'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  CircularProgress,
  Tabs,
  Tab,
  IconButton,
  Snackbar,
  Tooltip,
  Avatar,
} from '@mui/material';
import {
  Add,
  ContentCopy,
  CheckCircle,
  ArrowBack,
  Groups,
  Pool as PoolIcon,
  EmojiEvents,
  Share,
} from '@mui/icons-material';
import { AppShell, PoolTable } from '@/components';
import { SquadChat } from '@/components/squad/SquadChat';
import { SquadMemberList } from '@/components/squad/SquadMemberList';
import { SquadLeaderboard } from '@/components/squad/SquadLeaderboard';
import { CreateSquadPoolForm } from '@/components/squad/CreateSquadPoolForm';
import { cancelSquadPool } from '@/lib/api';
import { getAvatarUrl } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import {
  useSquad,
  useSquadPools,
  useSquadChat,
  useSquadLeaderboard,
  useCreateSquadPool,
  useSendSquadMessage,
  useKickSquadMember,
} from '@/hooks/useSquads';
import { useWalletBridge, usePriceStream, useBets } from '@/hooks';
import type { Pool } from '@/lib/api';

export default function SquadDetailPage() {
  const t = useThemeTokens();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { walletAddress } = useWalletBridge();

  const { data: squad, isLoading } = useSquad(id);
  const { data: pools } = useSquadPools(id);
  const { data: messages } = useSquadChat(id);
  const { data: leaderboard } = useSquadLeaderboard(id);
  const createPool = useCreateSquadPool(id);
  const sendMessage = useSendSquadMessage(id);
  const kickMember = useKickSquadMember(id);
  const { data: betsData } = useBets();
  const { getPrice } = usePriceStream(['BTC', 'ETH', 'SOL']);

  const [tab, setTab] = useState(0);
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [copied, setCopied] = useState<'link' | 'code' | false>(false);

  const isOwner = squad?.members?.some(m => m.walletAddress === walletAddress && m.role === 'OWNER') ?? false;

  const inviteLink = typeof window !== 'undefined' && squad
    ? `${window.location.origin}/squads?join=${squad.inviteCode}`
    : '';

  const handleCopyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied('link');
    }
  };

  const handleCopyCode = () => {
    if (squad?.inviteCode) {
      navigator.clipboard.writeText(squad.inviteCode);
      setCopied('code');
    }
  };

  const handleCreatePool = (params: { asset: string; durationSeconds: number; maxBettors?: number }) => {
    createPool.mutate(params, {
      onSuccess: () => setShowCreatePool(false),
    });
  };

  // Map user bets for PoolTable
  const userBetByPoolId = useMemo(() => {
    const map = new Map<string, { side: 'UP' | 'DOWN' | 'DRAW'; isWinner: boolean | null }>();
    for (const bet of betsData?.data || []) {
      map.set(bet.pool.id, { side: bet.side, isWinner: bet.isWinner });
    }
    return map;
  }, [betsData]);

  // Cast squad pools to Pool type for PoolTable
  const poolList: Pool[] = (pools || []).map(p => ({
    ...p,
    squadId: undefined as unknown as string,
    maxBettors: undefined as unknown as number,
  }));

  if (isLoading) {
    return (
      <AppShell>
        <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: t.up }} />
          </Box>
        </Container>
      </AppShell>
    );
  }

  if (!squad) {
    return (
      <AppShell>
        <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 } }}>
          <Box sx={{ textAlign: 'center', py: 12, px: 4 }}>
            <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
              Squad not found or you{"'"}re not a member
            </Typography>
            <Button
              onClick={() => router.push('/squads')}
              sx={{ mt: 2, color: t.up, textTransform: 'none', fontWeight: 600 }}
            >
              Back to Squads
            </Button>
          </Box>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 } }}>
        {/* Back button */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: { xs: 1.5, md: 2 }, mb: 1 }}>
          <IconButton onClick={() => router.push('/squads')} size="small" sx={{ color: 'text.secondary' }}>
            <ArrowBack fontSize="small" />
          </IconButton>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 500 }}>
            My Squads
          </Typography>
        </Box>

        {/* ─── Profile-style cards grid ─── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: '2.5fr repeat(4, 1fr)' },
            gap: 0.5,
            mb: 3,
          }}
        >
          {/* Card 1: Squad identity — name, avatar, invite code */}
          <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2 }, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5 }}>
            <Avatar
              src={getAvatarUrl(squad.id)}
              sx={{ width: { xs: 40, md: 56 }, height: { xs: 40, md: 56 } }}
            />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, fontWeight: 700, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {squad.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                <Tooltip title={copied === 'code' ? 'Copied!' : 'Copy code'} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                  <Box
                    component="button"
                    onClick={handleCopyCode}
                    sx={{
                      background: 'none', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.3,
                      color: copied === 'code' ? t.gain : 'text.secondary',
                      '&:hover': { borderColor: 'rgba(255,255,255,0.2)', color: t.text.primary },
                      transition: 'all 0.15s',
                    }}
                  >
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                      {squad.inviteCode}
                    </Typography>
                    {copied === 'code' ? <CheckCircle sx={{ fontSize: 11 }} /> : <ContentCopy sx={{ fontSize: 11 }} />}
                  </Box>
                </Tooltip>
                <Tooltip title={copied === 'link' ? 'Copied!' : 'Copy invite link'} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                  <Box
                    component="button"
                    onClick={handleCopyLink}
                    sx={{
                      background: 'none', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.3,
                      color: copied === 'link' ? t.gain : 'text.secondary',
                      '&:hover': { borderColor: 'rgba(255,255,255,0.2)', color: t.text.primary },
                      transition: 'all 0.15s',
                    }}
                  >
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>
                      Link
                    </Typography>
                    {copied === 'link' ? <CheckCircle sx={{ fontSize: 11 }} /> : <Share sx={{ fontSize: 11 }} />}
                  </Box>
                </Tooltip>
              </Box>
            </Box>
          </Box>

          {/* Card 2: Members */}
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>Members</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                  {squad.memberCount}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                  / {squad.maxMembers}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Card 3: Active Pools */}
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>Active Pools</Typography>
              <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: t.gain, fontVariantNumeric: 'tabular-nums' }}>
                {pools?.filter(p => p.status === 'JOINING' || p.status === 'ACTIVE').length ?? 0}
              </Typography>
            </Box>
          </Box>

          {/* Card 4: Total Pools */}
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>Total Pools</Typography>
              <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                {squad.poolCount}
              </Typography>
            </Box>
          </Box>

          {/* Card 5: Create Pool CTA */}
          <Box
            onClick={() => setShowCreatePool(true)}
            sx={{
              bgcolor: `${t.up}12`,
              borderRadius: 1,
              px: { xs: 1.5, md: 3 },
              py: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              '&:hover': { bgcolor: `${t.up}20` },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Add sx={{ fontSize: 20, color: t.up }} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.up }}>
                Create Pool
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Tabs — matches profile/leaderboard pattern */}
        <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)', mb: 3 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            scrollButtons={false}
            sx={{
              minHeight: 44,
              '& .MuiTabs-indicator': {
                backgroundColor: t.up,
                height: 2,
              },
              '& .MuiTab-root': {
                color: 'text.secondary',
                fontWeight: 500,
                textTransform: 'none',
                fontSize: { xs: '0.8rem', sm: '0.85rem' },
                px: { xs: 1.5, sm: 2.5 },
                minHeight: 44,
                minWidth: 'auto',
                '&.Mui-selected': { color: t.text.primary },
              },
            }}
          >
            <Tab label={`Pools (${pools?.length ?? 0})`} />
            <Tab label={`Members (${squad.memberCount})`} />
            <Tab label="Leaderboard" />
          </Tabs>
        </Box>

        {/* Tab content */}
        {tab === 0 && (
          <Box>
            {pools && pools.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
                <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
                  No pools yet — create one to get started!
                </Typography>
              </Box>
            ) : (
              <>
                <PoolTable
                  pools={poolList}
                  userBetByPoolId={userBetByPoolId}
                  getPrice={getPrice}
                  popularPoolIds={new Set()}
                  alwaysShowView
                />
                {/* Cancel buttons for user's empty pools */}
                {pools?.filter(p => p.betCount === 0 && p.status === 'JOINING').map(p => (
                  <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, bgcolor: 'rgba(255,255,255,0.02)' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                      {p.asset} · {p.interval} · No predictions yet
                    </Typography>
                    <Button
                      size="small"
                      color="error"
                      onClick={async () => {
                        if (!walletAddress) return;
                        try {
                          await cancelSquadPool(id, p.id, walletAddress);
                          window.location.reload();
                        } catch (err) {
                          alert(err instanceof Error ? err.message : 'Failed to cancel');
                        }
                      }}
                      sx={{ fontSize: '0.7rem', textTransform: 'none' }}
                    >
                      Cancel Pool
                    </Button>
                  </Box>
                ))}
              </>
            )}
          </Box>
        )}

        {tab === 1 && (
          <SquadMemberList
            members={squad.members}
            currentWallet={walletAddress}
            isOwner={isOwner}
            onKick={(wallet) => kickMember.mutate(wallet)}
          />
        )}

        {tab === 2 && (
          <SquadLeaderboard entries={leaderboard} currentWallet={walletAddress} />
        )}

        {/* Floating chat widget — always visible */}
        <SquadChat
          messages={messages}
          onSend={(content) => sendMessage.mutate(content)}
          isSending={sendMessage.isPending}
          currentWallet={walletAddress}
        />

        {/* Create pool dialog */}
        <CreateSquadPoolForm
          open={showCreatePool}
          onClose={() => setShowCreatePool(false)}
          onSubmit={handleCreatePool}
          isLoading={createPool.isPending}
        />

        {/* Copy snackbar */}
        <Snackbar
          open={!!copied}
          autoHideDuration={2000}
          onClose={() => setCopied(false)}
          message={copied === 'code' ? 'Invite code copied!' : 'Invite link copied!'}
        />
      </Container>
    </AppShell>
  );
}
