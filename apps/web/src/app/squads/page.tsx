'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from '@mui/material';
import { Add, Login, Groups } from '@mui/icons-material';
import { AppShell } from '@/components';
import { SquadCard } from '@/components/squad/SquadCard';
import { CreateSquadDialog } from '@/components/squad/CreateSquadDialog';
import { UP_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { useSquads, useCreateSquad, useJoinSquad } from '@/hooks/useSquads';
import { useWalletBridge } from '@/hooks';
import { resolveSquadInvite, type SquadInviteInfo } from '@/lib/api';

export default function SquadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { walletAddress, connected, login } = useWalletBridge();

  const { data: squads, isLoading, error } = useSquads();
  const createSquad = useCreateSquad();
  const joinSquad = useJoinSquad();

  const [showCreate, setShowCreate] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<SquadInviteInfo | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);

  // Handle ?join=CODE query param
  const joinParam = searchParams.get('join');
  useEffect(() => {
    if (joinParam && connected) {
      setJoinCode(joinParam);
      setJoinLoading(true);
      resolveSquadInvite(joinParam)
        .then((res) => {
          if (res.data) {
            setInviteInfo(res.data);
            setShowJoin(true);
          }
        })
        .finally(() => setJoinLoading(false));
    }
  }, [joinParam, connected]);

  const handleCreate = (name: string) => {
    createSquad.mutate(name, {
      onSuccess: (res) => {
        setShowCreate(false);
        if (res.data?.id) {
          router.push(`/squads/${res.data.id}`);
        }
      },
    });
  };

  const handleJoin = () => {
    if (!joinCode) return;
    joinSquad.mutate(joinCode, {
      onSuccess: (res) => {
        setShowJoin(false);
        setInviteInfo(null);
        if (res.data?.squadId) {
          router.push(`/squads/${res.data.squadId}`);
        }
      },
    });
  };

  const handleOpenJoin = () => {
    setJoinCode('');
    setJoinError('');
    setShowCodeInput(true);
  };

  const handleResolveCode = () => {
    if (!joinCode.trim()) return;
    setJoinError('');
    setJoinLoading(true);
    resolveSquadInvite(joinCode.trim())
      .then((res) => {
        if (res.data) {
          setInviteInfo(res.data);
          setShowCodeInput(false);
          setShowJoin(true);
        } else {
          setJoinError('Invalid invite code');
        }
      })
      .catch(() => setJoinError('Failed to resolve code'))
      .finally(() => setJoinLoading(false));
  };

  if (!connected) {
    return (
      <AppShell>
        <Container maxWidth="xl">
          <Box sx={{ py: 12, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '1.3rem', fontWeight: 700, mb: 1 }}>
              Squad Pools
            </Typography>
            <Typography sx={{ color: 'text.secondary', mb: 3, fontSize: '0.9rem' }}>
              Connect your wallet to create or join a squad
            </Typography>
            <Button
              onClick={login}
              variant="contained"
              sx={{
                backgroundColor: UP_COLOR,
                color: '#000',
                '&:hover': { backgroundColor: UP_COLOR, filter: 'brightness(1.15)' },
                fontWeight: 700,
                textTransform: 'none',
                px: 4,
              }}
            >
              Connect Wallet
            </Button>
          </Box>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Container maxWidth="xl">
        {/* Title */}
        <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, mt: { xs: 2, md: 3 }, mb: 3 }}>
          My Squads
        </Typography>

        {/* Action cards + squad list */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {/* Action cards row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr' }, gap: '3px' }}>
            {/* Create Squad */}
            <Box
              onClick={() => setShowCreate(true)}
              sx={{
                bgcolor: '#0D1219',
                py: { xs: 3, md: 4 },
                px: 2,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                '&:hover': { background: 'rgba(255,255,255,0.04)' },
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                border: '1px dashed rgba(255,255,255,0.08)',
              }}
            >
              <Box sx={{
                width: 44, height: 44, borderRadius: '50%',
                bgcolor: `${UP_COLOR}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Add sx={{ fontSize: 24, color: UP_COLOR }} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: UP_COLOR }}>
                Create Squad
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', textAlign: 'center' }}>
                Start a private group for friends
              </Typography>
            </Box>

            {/* Join Squad */}
            <Box
              onClick={handleOpenJoin}
              sx={{
                bgcolor: '#0D1219',
                py: { xs: 3, md: 4 },
                px: 2,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                '&:hover': { background: 'rgba(255,255,255,0.04)' },
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                border: '1px dashed rgba(255,255,255,0.08)',
              }}
            >
              <Box sx={{
                width: 44, height: 44, borderRadius: '50%',
                bgcolor: `${ACCENT_COLOR}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Login sx={{ fontSize: 24, color: ACCENT_COLOR }} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: ACCENT_COLOR }}>
                Join with Code
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', textAlign: 'center' }}>
                Enter an invite code from a friend
              </Typography>
            </Box>
          </Box>

          {/* Loading */}
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={32} sx={{ color: UP_COLOR }} />
            </Box>
          )}

          {/* Error */}
          {error && (
            <Box sx={{ textAlign: 'center', py: 8, bgcolor: '#0D1219' }}>
              <Typography color="text.secondary">Failed to load squads</Typography>
            </Box>
          )}

          {/* Empty state */}
          {!isLoading && squads && squads.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8, px: 4, bgcolor: '#0D1219' }}>
              <Typography color="text.secondary" sx={{ fontSize: '0.9rem' }}>
                You{"'"}re not in any squads yet
              </Typography>
            </Box>
          )}

          {/* Squad cards */}
          {squads?.map((squad) => (
            <SquadCard
              key={squad.id}
              squad={squad}
              onClick={() => router.push(`/squads/${squad.id}`)}
            />
          ))}
        </Box>

        {/* Create dialog */}
        <CreateSquadDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          isLoading={createSquad.isPending}
        />

        {/* Join — step 1: enter code */}
        <Dialog
          open={showCodeInput}
          onClose={() => setShowCodeInput(false)}
          maxWidth="xs"
          fullWidth
          PaperProps={{ sx: { background: '#0D1219', borderRadius: 0 } }}
        >
          <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Login sx={{ fontSize: 20, color: UP_COLOR }} />
            Join a Squad
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mb: 2 }}>
              Enter the invite code shared by a squad member
            </Typography>
            <TextField
              autoFocus
              fullWidth
              placeholder="e.g. a1b2c3d4"
              value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value); setJoinError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleResolveCode()}
              inputProps={{ maxLength: 20 }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(255,255,255,0.03)',
                  fontSize: '1rem',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textAlign: 'center',
                },
                '& .MuiOutlinedInput-input': {
                  textAlign: 'center',
                },
              }}
            />
            {joinError && (
              <Alert severity="error" sx={{ mt: 1.5, bgcolor: 'rgba(248,113,113,0.1)', border: 'none', borderRadius: 0, fontSize: '0.8rem' }}>
                {joinError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setShowCodeInput(false)} sx={{ color: 'text.secondary', textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              onClick={handleResolveCode}
              disabled={!joinCode.trim() || joinLoading}
              variant="contained"
              sx={{
                backgroundColor: UP_COLOR,
                color: '#000',
                '&:hover': { backgroundColor: UP_COLOR, filter: 'brightness(1.15)' },
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: '2px',
                px: 3,
              }}
            >
              {joinLoading ? <CircularProgress size={20} /> : 'Continue'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Join — step 2: confirmation */}
        <Dialog
          open={showJoin}
          onClose={() => { setShowJoin(false); setInviteInfo(null); }}
          maxWidth="xs"
          fullWidth
          PaperProps={{ sx: { background: '#0D1219', borderRadius: 0 } }}
        >
          <DialogContent>
            {inviteInfo && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Groups sx={{ fontSize: 48, color: UP_COLOR, mb: 1.5 }} />
                <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, mb: 0.5 }}>
                  {inviteInfo.name}
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mb: 2 }}>
                  {inviteInfo.memberCount}/{inviteInfo.maxMembers} members
                </Typography>
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: 2, py: 1.5 }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                    Join this squad to play private pools with friends
                  </Typography>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => { setShowJoin(false); setInviteInfo(null); }} sx={{ color: 'text.secondary', textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              onClick={handleJoin}
              disabled={joinSquad.isPending}
              variant="contained"
              sx={{
                backgroundColor: UP_COLOR,
                color: '#000',
                '&:hover': { backgroundColor: UP_COLOR, filter: 'brightness(1.15)' },
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: '2px',
              }}
            >
              {joinSquad.isPending ? <CircularProgress size={20} /> : 'Join Squad'}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </AppShell>
  );
}
