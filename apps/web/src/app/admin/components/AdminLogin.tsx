'use client';

import { useState } from 'react';
import { Box, Card, TextField, Typography, InputAdornment, IconButton, Tooltip } from '@mui/material';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import { verifyKeyDetailed, setAdminRole } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { ActionButton, ErrorAlert, Body, Meta } from '../ui';

/**
 * Admin login surface.
 *
 * Phase 6 additions:
 *  - 'Show key' eye toggle (auth-friendly: the operator sees what they
 *    typed before submitting - sessionStorage already keeps the plaintext
 *    after login, so hiding it on the input is theatre).
 *  - Distinct messages for 'invalid' / 'rate-limited' / 'unreachable' so
 *    the operator can react to 'API down' differently from 'wrong key'.
 *  - Friendly error surface via <ErrorAlert> instead of raw MUI <Alert>.
 */
export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);

    const r = await verifyKeyDetailed(trimmed);
    if (r.kind === 'ok') {
      sessionStorage.setItem('admin-key', trimmed);
      setAdminRole(r.role);
      onLogin();
      // Note: other tabs see this via the `storage` event and re-verify
      // on their side. We don't need to do anything else here.
    } else if (r.kind === 'invalid') {
      setError({ title: 'Invalid API key', message: r.message });
    } else if (r.kind === 'rate-limited') {
      setError({ title: 'Too many attempts', message: r.message });
    } else {
      setError({ title: 'API unreachable', message: r.message });
    }
    setLoading(false);
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: t.bg.app, p: 2 }}>
      <Card
        elevation={0}
        sx={{
          p: 4, maxWidth: 420, width: '100%',
          bgcolor: t.bg.surface,
          border: `1px solid ${t.border.medium}`,
          borderRadius: 2,
          backgroundImage: 'none',
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box sx={{
            width: 56, height: 56, borderRadius: '50%',
            bgcolor: t.hover.subtle, color: t.text.tertiary,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            mb: 1.5,
          }}>
            <LockRoundedIcon sx={{ fontSize: 28 }} />
          </Box>
          <Typography component="h1" sx={{ fontSize: '1.25rem', fontWeight: 600, color: t.text.primary }}>
            Admin Panel
          </Typography>
          <Body sx={{ mt: 0.5 }}>Enter your API key to continue.</Body>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            type={showKey ? 'text' : 'password'}
            placeholder="API Key"
            value={key}
            onChange={e => setKey(e.target.value)}
            sx={{
              mb: 2,
              '& .MuiInputBase-root': {
                fontFamily: showKey ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
              },
            }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={showKey ? 'Hide key' : 'Show key'}>
                    <IconButton
                      size="small"
                      onClick={() => setShowKey(v => !v)}
                      edge="end"
                      sx={{ color: t.text.tertiary, '&:hover': { color: t.text.primary } }}
                    >
                      {showKey ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
          {error && (
            <Box sx={{ mb: 2 }}>
              <ErrorAlert title={error.title} message={error.message} />
            </Box>
          )}
          <ActionButton
            kind="primary"
            type="submit"
            label="Enter"
            loading={loading}
            disabled={!key.trim()}
            fullWidth
            sx={{ py: 1 }}
          />
          <Meta sx={{ mt: 1.5, textAlign: 'center', display: 'block' }}>
            Logging out in another tab will sign you out here too.
          </Meta>
        </Box>
      </Card>
    </Box>
  );
}
