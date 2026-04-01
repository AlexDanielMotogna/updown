'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
} from '@mui/material';
import { useThemeTokens } from '@/app/providers';

interface CreateSquadDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  isLoading: boolean;
}

export function CreateSquadDialog({ open, onClose, onSubmit, isLoading }: CreateSquadDialogProps) {
  const t = useThemeTokens();
  const [name, setName] = useState('');

  const handleSubmit = () => {
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { background: t.bg.surfaceAlt, border: t.surfaceBorder, boxShadow: t.surfaceShadow, borderRadius: 1 } }}
    >
      <DialogTitle sx={{ fontWeight: 700 }}>Create a Squad</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Squad Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          inputProps={{ maxLength: 50 }}
          sx={{ mt: 1 }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: 'text.secondary', textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!name.trim() || isLoading}
          variant="contained"
          sx={{
            backgroundColor: t.up,
            color: t.text.contrast,
            '&:hover': { backgroundColor: t.up, filter: 'brightness(1.15)' },
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: '2px',
          }}
        >
          {isLoading ? <CircularProgress size={20} /> : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
