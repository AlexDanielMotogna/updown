'use client';

import { useState } from 'react';
import { Box, Card, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { verifyKey } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';

export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError('');

    const valid = await verifyKey(key.trim());
    if (valid) {
      sessionStorage.setItem('admin-key', key.trim());
      onLogin();
    } else {
      setError('Invalid API key');
    }
    setLoading(false);
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: t.bg.app }}>
      <Card sx={{ p: 4, maxWidth: 400, width: '100%', bgcolor: t.bg.surface, border: t.surfaceBorder, boxShadow: t.surfaceShadow }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <LockOutlinedIcon sx={{ fontSize: 48, color: t.text.dimmed, mb: 1 }} />
          <Typography variant="h5" fontWeight={600}>Admin Panel</Typography>
          <Typography variant="body2" color="text.secondary">Enter your API key to continue</Typography>
        </Box>
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            type="password"
            placeholder="API Key"
            value={key}
            onChange={e => setKey(e.target.value)}
            sx={{ mb: 2 }}
            autoFocus
          />
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Button fullWidth variant="contained" type="submit" disabled={loading || !key.trim()}>
            {loading ? <CircularProgress size={20} /> : 'Enter'}
          </Button>
        </form>
      </Card>
    </Box>
  );
}
