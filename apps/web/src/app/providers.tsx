'use client';

import { ReactNode, createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NotificationToasts } from '@/components/NotificationToasts';
import { ReferralDialog } from '@/components/ReferralDialog';
import { ReferralBanner } from '@/components/ReferralBanner';
import { useNotifications } from '@/hooks/useNotifications';
import { useReferral } from '@/hooks/useReferral';
import { darkTokens, lightTokens, type ThemeTokens } from '@/lib/theme';

function NotificationLayer({ children }: { children: ReactNode }) {
  useNotifications();
  return (
    <>
      {children}
      <NotificationToasts />
    </>
  );
}

function ReferralLayer({ children }: { children: ReactNode }) {
  const {
    referrerInfo,
    showDialog,
    showBanner,
    loading,
    acceptReferral,
    declineReferral,
  } = useReferral();

  return (
    <>
      {showBanner && referrerInfo && (
        <ReferralBanner referrerWallet={referrerInfo} />
      )}
      {children}
      {showDialog && referrerInfo && (
        <ReferralDialog
          open={showDialog}
          referrerWallet={referrerInfo}
          loading={loading}
          onAccept={acceptReferral}
          onDecline={declineReferral}
        />
      )}
    </>
  );
}

// ─── Theme mode context ──────────────────────────────────────────────────────
type ThemeMode = 'dark' | 'light';

interface ThemeModeContextValue {
  mode: ThemeMode;
  tokens: ThemeTokens;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within Providers');
  return ctx;
}

export function useThemeTokens(): ThemeTokens {
  return useThemeMode().tokens;
}

// ─── Build MUI theme from tokens ─────────────────────────────────────────────
function buildMuiTheme(t: ThemeTokens) {
  return createTheme({
    palette: {
      mode: t.mode,
      primary: {
        main: t.text.primary,
        light: t.text.primary,
        dark: t.text.secondary,
        contrastText: t.text.contrast,
      },
      secondary: {
        main: t.text.secondary,
        light: t.text.bright,
        dark: t.text.dimmed,
        contrastText: t.text.contrast,
      },
      background: {
        default: t.bg.app,
        paper: t.bg.surface,
      },
      text: {
        primary: t.text.primary,
        secondary: t.text.secondary,
        disabled: t.text.disabled,
      },
      divider: t.border.medium,
      success: {
        main: t.success,
        dark: t.successDark,
      },
      warning: {
        main: t.warning,
      },
      error: {
        main: t.error,
      },
    },
    typography: {
      fontFamily: 'var(--font-satoshi), "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      fontWeightLight: 300,
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 600,
      h1: { fontSize: '3.5rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 },
      h2: { fontSize: '2.75rem', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.2 },
      h3: { fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.3 },
      h4: { fontSize: '1.5rem', fontWeight: 400, lineHeight: 1.4 },
      h5: { fontSize: '1.25rem', fontWeight: 500, lineHeight: 1.4 },
      h6: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.5 },
      body1: { fontSize: '1rem', fontWeight: 300, lineHeight: 1.6 },
      body2: { fontSize: '0.875rem', fontWeight: 300, lineHeight: 1.6 },
      caption: { fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.02em' },
    },
    shape: { borderRadius: 6 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Invisible scrollbars across the whole app - scrolling still works,
          // the bar just isn't painted (Firefox/legacy-Edge via scrollbarWidth,
          // WebKit via the ::-webkit-scrollbar pseudo-element).
          '*': { scrollbarWidth: 'none', msOverflowStyle: 'none' },
          '*::-webkit-scrollbar': { width: 0, height: 0, display: 'none' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            background: t.bg.surface,
            border: t.surfaceBorder,
            boxShadow: t.surfaceShadow,
            transition: 'all 0.2s ease',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 4, textTransform: 'none', fontWeight: 500, letterSpacing: '0.02em', padding: '10px 20px', transition: 'all 0.2s ease' },
          contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
          outlined: { borderWidth: 1, borderColor: t.border.strong, '&:hover': { borderWidth: 1, backgroundColor: t.hover.default } },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 4,
              backgroundColor: t.bg.input,
              '& fieldset': { borderColor: t.border.default },
              '&:hover fieldset': { borderColor: t.border.emphasis },
              '&.Mui-focused fieldset': { borderColor: t.border.hover, borderWidth: 1 },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 3, fontWeight: 500, letterSpacing: '0.02em' },
          outlined: { borderColor: t.border.strong },
        },
      },
      MuiTabs: {
        styleOverrides: { indicator: { backgroundColor: t.text.primary, height: 2 } },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 400, color: t.text.secondary, '&.Mui-selected': { color: t.text.primary } },
        },
      },
      MuiDialog: {
        styleOverrides: { paper: {
          background: t.bg.surface,
          border: t.surfaceBorder,
          boxShadow: t.surfaceShadow,
          borderRadius: 6,
        } },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 6, backgroundColor: `${t.error}4D` },
          bar: { borderRadius: 6 },
        },
      },
    },
  });
}

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

export function Providers({ children, initialTheme = 'dark' }: { children: ReactNode; initialTheme?: 'dark' | 'light' }) {
  const [mode, setModeState] = useState<ThemeMode>(initialTheme);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem('theme-mode', m);
    document.cookie = `theme-mode=${m};path=/;max-age=31536000;SameSite=Lax`;
    document.documentElement.style.background = m === 'dark' ? darkTokens.bg.app : lightTokens.bg.app;
    document.documentElement.style.colorScheme = m;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', m === 'dark' ? darkTokens.bg.app : lightTokens.bg.app);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const tokens = mode === 'dark' ? darkTokens : lightTokens;
  const muiTheme = useMemo(() => buildMuiTheme(tokens), [tokens]);

  const themeModeValue = useMemo<ThemeModeContextValue>(
    () => ({ mode, tokens, toggle, setMode }),
    [mode, tokens, toggle, setMode],
  );

  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('devnet'),
    [],
  );
  const connection = useMemo(() => new Connection(endpoint), [endpoint]);

  // Privy 2.x embedded-wallet signing needs @solana/kit RPC clients under
  // config.solana.rpcs (keyed by CAIP chain), separate from the legacy
  // solanaClusters. Without it: "No RPC configuration found for chain solana:devnet".
  const solanaRpcs = useMemo(
    () => ({
      'solana:devnet': {
        rpc: createSolanaRpc(endpoint),
        rpcSubscriptions: createSolanaRpcSubscriptions(endpoint.replace(/^http/, 'ws')),
      },
    }),
    [endpoint],
  );

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID!}
      config={{
        appearance: {
          theme: mode,
          accentColor: '#FFFFFF',
          logo: mode === 'dark' ? '/updown-logos/Logo_cyan_text_white.png' : '/updown-logos/Logo_cyan_text_dark_Medium.png',
          walletList: ['phantom', 'solflare', 'backpack', 'coinbase_wallet', 'metamask', 'detected_solana_wallets'],
          walletChainType: 'ethereum-and-solana',
          showWalletLoginFirst: false,
        },
        // Email + Google (both free, no external wallet): every user signs up
        // WITHOUT an external wallet, so Privy always creates the embedded
        // wallets → gasless silent betting (no SOL, no popup) and one clean
        // identity. (X login is deferred — its OAuth may need a paid X API tier.)
        loginMethods: ['email', 'google'],
        embeddedWallets: {
          // One email login provisions BOTH embedded wallets: Solana (the app /
          // gasless betting identity) AND Ethereum (the HyperLiquid trading
          // account the terminal uses). Both are exportable from the profile.
          solana: { createOnLogin: 'all-users' },
          ethereum: { createOnLogin: 'all-users' },
          // Sign silently — no Privy confirm modal. The app's bet UI is the
          // confirmation; the embedded wallet co-signs the relayer's tx without
          // a popup (gasless flow, see useWalletBridge.coSignAndSend).
          showWalletUIs: false,
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
        solanaClusters: [{ name: 'devnet', rpcUrl: endpoint }],
        solana: { rpcs: solanaRpcs },
      }}
    >
      <SolanaConnectionContext.Provider value={connection}>
        <QueryClientProvider client={queryClient}>
          <ThemeModeContext.Provider value={themeModeValue}>
            <ThemeProvider theme={muiTheme}>
              <CssBaseline />
              <ErrorBoundary>
                <NotificationLayer>
                  <ReferralLayer>
                    {children}
                  </ReferralLayer>
                </NotificationLayer>
              </ErrorBoundary>
            </ThemeProvider>
          </ThemeModeContext.Provider>
        </QueryClientProvider>
      </SolanaConnectionContext.Provider>
    </PrivyProvider>
  );
}
