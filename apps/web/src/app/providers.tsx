'use client';

import { ReactNode, createContext, useContext, useMemo } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Minimalist dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FFFFFF',
      light: '#FFFFFF',
      dark: 'rgba(255, 255, 255, 0.8)',
      contrastText: '#0A0A0A',
    },
    secondary: {
      main: 'rgba(255, 255, 255, 0.5)',
      light: 'rgba(255, 255, 255, 0.7)',
      dark: 'rgba(255, 255, 255, 0.3)',
      contrastText: '#0A0A0A',
    },
    background: {
      default: '#0A0A0A',
      paper: '#141414',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 255, 255, 0.5)',
      disabled: 'rgba(255, 255, 255, 0.38)',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
    success: {
      main: '#4CAF50',
      dark: '#16A34A',
    },
    warning: {
      main: '#F59E0B',
    },
    error: {
      main: '#FF5252',
    },
  },
  typography: {
    fontFamily: 'var(--font-satoshi), "Satoshi", -apple-system, BlinkMacSystemFont, sans-serif',
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    h1: {
      fontSize: '3.5rem',
      fontWeight: 600,
      letterSpacing: '-0.02em',
      lineHeight: 1.1,
    },
    h2: {
      fontSize: '2.75rem',
      fontWeight: 300,
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
    },
    h3: {
      fontSize: '2rem',
      fontWeight: 400,
      letterSpacing: '-0.01em',
      lineHeight: 1.3,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 400,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1rem',
      fontWeight: 300,
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 300,
      lineHeight: 1.6,
    },
    caption: {
      fontSize: '0.75rem',
      fontWeight: 500,
      letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) #0A0A0A',
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: '#0A0A0A',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '4px',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          background: '#141414',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          transition: 'all 0.2s ease',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
          letterSpacing: '0.02em',
          padding: '10px 20px',
          transition: 'all 0.2s ease',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        outlined: {
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.15)',
          '&:hover': {
            borderWidth: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.2)',
            },
            '&.Mui-focused fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.3)',
              borderWidth: 1,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
          letterSpacing: '0.02em',
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.2)',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: '#FFFFFF',
          height: 2,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 400,
          color: 'rgba(255, 255, 255, 0.5)',
          '&.Mui-selected': {
            color: '#FFFFFF',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: '#141414',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 8,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: 'rgba(255, 82, 82, 0.3)',
        },
        bar: {
          borderRadius: 4,
        },
      },
    },
  },
});

const queryClient = new QueryClient();

// Solana connection context (replaces wallet-adapter's ConnectionProvider)
const SolanaConnectionContext = createContext<Connection | null>(null);

export function useSolanaConnection(): Connection {
  const connection = useContext(SolanaConnectionContext);
  if (!connection) throw new Error('useSolanaConnection must be used within Providers');
  return connection;
}

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('devnet'),
    [],
  );
  const connection = useMemo(() => new Connection(endpoint), [endpoint]);

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID!}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#FFFFFF',
          walletChainType: 'solana-only',
        },
        loginMethods: ['wallet'],
        embeddedWallets: {
          solana: { createOnLogin: 'all-users' },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
        solanaClusters: [{ name: 'devnet', rpcUrl: endpoint }],
      }}
    >
      <SolanaConnectionContext.Provider value={connection}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={darkTheme}>
            <CssBaseline />
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </ThemeProvider>
        </QueryClientProvider>
      </SolanaConnectionContext.Provider>
    </PrivyProvider>
  );
}
