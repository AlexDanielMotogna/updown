'use client';

import { type ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';

/**
 * Terminal auth = Privy with an EVM (HyperLiquid) wallet. Separate from web's
 * Solana-only Privy config; later unified via a shared Privy app id for SSO
 * across *.updown.my (ADR-002). If the app id isn't configured yet, render
 * children directly so the market data UI still works in dev.
 */
export function Providers({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <>{children}</>;

  return (
    <PrivyProvider
      appId={appId}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#16c784',
          walletChainType: 'ethereum-only',
          walletList: ['metamask', 'rabby_wallet', 'wallet_connect', 'coinbase_wallet', 'phantom'],
          showWalletLoginFirst: true,
        },
        loginMethods: ['wallet', 'email'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
