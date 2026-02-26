'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Link,
} from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  HourglassEmpty,
  Edit,
} from '@mui/icons-material';
import type { TransactionStatus } from '@/hooks/useTransactions';
import { getExplorerTxUrl } from '@/lib/format';

interface TransactionModalProps {
  open: boolean;
  status: TransactionStatus;
  title?: string;
  txSignature?: string;
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
}

function StatusIcon({ status }: { status: TransactionStatus }) {
  const iconSx = { fontSize: 72 };

  switch (status) {
    case 'preparing':
      return <HourglassEmpty sx={{ ...iconSx, color: '#FFFFFF' }} />;
    case 'signing':
      return <Edit sx={{ ...iconSx, color: '#FFFFFF' }} />;
    case 'confirming':
      return <CircularProgress size={72} sx={{ color: '#FFFFFF' }} />;
    case 'success':
      return <CheckCircle sx={{ ...iconSx, color: '#4CAF50' }} />;
    case 'error':
      return <ErrorIcon sx={{ ...iconSx, color: '#FF5252' }} />;
    default:
      return null;
  }
}

function StatusMessage({ status }: { status: TransactionStatus }) {
  switch (status) {
    case 'preparing':
      return 'Preparing transaction...';
    case 'signing':
      return 'Please sign the transaction in your wallet';
    case 'confirming':
      return 'Confirming transaction on Solana...';
    case 'success':
      return 'Transaction successful!';
    case 'error':
      return 'Transaction failed';
    default:
      return '';
  }
}

export function TransactionModal({
  open,
  status,
  title = 'Transaction',
  txSignature,
  error,
  onClose,
  onRetry,
}: TransactionModalProps) {
  const isComplete = status === 'success' || status === 'error';
  const isPending = status === 'preparing' || status === 'signing' || status === 'confirming';

  return (
    <Dialog
      open={open}
      onClose={isComplete ? onClose : undefined}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: '#141414',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 1,
          maxWidth: 440,
        },
      }}
    >
      <DialogTitle
        sx={{
          textAlign: 'center',
          fontWeight: 500,
          pt: 4,
          pb: 0,
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 5,
          }}
        >
          <StatusIcon status={status} />

          <Typography
            variant="h6"
            sx={{
              mt: 3,
              textAlign: 'center',
              fontWeight: 400,
              color: status === 'error' ? 'error.main' : 'text.primary',
            }}
          >
            <StatusMessage status={status} />
          </Typography>

          {error && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 1,
                background: 'rgba(255, 82, 82, 0.1)',
                border: '1px solid rgba(255, 82, 82, 0.2)',
                maxWidth: '100%',
              }}
            >
              <Typography
                variant="body2"
                sx={{ color: 'error.main', textAlign: 'center', wordBreak: 'break-word' }}
              >
                {error}
              </Typography>
            </Box>
          )}

          {txSignature && (
            <Link
              href={getExplorerTxUrl(txSignature)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                mt: 3,
                color: '#FFFFFF',
                textDecoration: 'none',
                fontSize: '0.9rem',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
            >
              View on Solana Explorer
            </Link>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 0, justifyContent: 'center', gap: 2 }}>
        {status === 'error' && onRetry && (
          <Button
            onClick={onRetry}
            variant="outlined"
            sx={{
              borderColor: 'rgba(255, 255, 255, 0.2)',
              color: 'text.primary',
              px: 4,
              '&:hover': {
                borderColor: 'rgba(255, 255, 255, 0.4)',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
              },
            }}
          >
            Try Again
          </Button>
        )}
        {isComplete && (
          <Button
            onClick={onClose}
            variant="contained"
            sx={{
              px: 4,
              background: status === 'success'
                ? '#4CAF50'
                : 'rgba(255, 255, 255, 0.1)',
              color: status === 'success' ? '#fff' : 'text.primary',
              '&:hover': {
                background: status === 'success'
                  ? 'rgba(76, 175, 80, 0.85)'
                  : 'rgba(255, 255, 255, 0.15)',
              },
            }}
          >
            {status === 'success' ? 'Done' : 'Close'}
          </Button>
        )}
        {isPending && (
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontWeight: 400 }}
          >
            Please don&apos;t close this window
          </Typography>
        )}
      </DialogActions>
    </Dialog>
  );
}
