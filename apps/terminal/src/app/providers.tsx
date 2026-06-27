'use client';

import { type ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

/**
 * Terminal auth = Privy with BOTH Solana (the UpDown identity) and Ethereum
 * (the HyperLiquid account) on the same app id → SSO across *.updown.my
 * (ADR-002). The session carries both wallets, so the terminal resolves the
 * UpDown identity without asking the user to paste anything. If the app id
 * isn't configured, render children directly so market data still works.
 */
const solanaConnectors = toSolanaWalletConnectors({ shouldAutoConnect: true });

export function Providers({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;

  const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  return (
    <PrivyProvider
      appId={appId}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#16c784',
          walletChainType: 'ethereum-and-solana',
          walletList: ['metamask', 'rabby_wallet', 'phantom', 'wallet_connect', 'coinbase_wallet'],
          showWalletLoginFirst: false,
        },
        // Email-only, like the app: one login provisions the embedded Solana +
        // EVM (HyperLiquid) wallets, so no external-wallet picker on (re)connect.
        loginMethods: ['email'],
        embeddedWallets: {
          // Provision both chains so an email login here also yields the Solana
          // identity + the EVM (HyperLiquid) wallet. BYO external wallets skip
          // the embedded one for that chain (users-without-wallets).
          ethereum: { createOnLogin: 'users-without-wallets' },
          solana: { createOnLogin: 'users-without-wallets' },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
        solanaClusters: [{ name: 'devnet', rpcUrl: solanaRpc }],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
