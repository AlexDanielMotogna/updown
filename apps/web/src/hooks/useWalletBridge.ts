import { useCallback, useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import {
  useSendTransaction,
  useSignTransaction,
  useExportWallet,
} from '@privy-io/react-auth/solana';
import { Transaction, PublicKey } from '@solana/web3.js';
import { useSolanaConnection } from '@/app/providers';

export function useWalletBridge() {
  const { ready, authenticated, user, login, logout, getAccessToken, exportWallet: privyExportEvmWallet } = usePrivy();
  const { wallets } = useWallets();
  const connection = useSolanaConnection();
  const { sendTransaction: embeddedSend } = useSendTransaction();
  const { signTransaction: embeddedSign } = useSignTransaction();
  const { exportWallet: privyExportWallet } = useExportWallet();

  // Embedded-only: login is email/Google and external wallets are disabled in the
  // Privy config, so the Solana signer is ALWAYS the app-created embedded wallet.
  // SOLANA-ONLY: the user also has an EVM embedded wallet (0x…) for the trading
  // terminal — that must NEVER be treated as the Solana signer (new PublicKey
  // would throw "Non-base58 character" and break the whole app).
  const activeWallet = useMemo(() => {
    const sol = wallets.filter((w) => !w.address.startsWith('0x'));
    if (!sol.length) return null;
    return sol.find((w) => w.connectorType === 'embedded') ?? sol[0];
  }, [wallets]);

  const connected = ready && authenticated;

  // Never let an EVM address through as the Solana wallet identity.
  const rawAddress = activeWallet?.address ?? user?.wallet?.address ?? null;
  const walletAddress = rawAddress && !rawAddress.startsWith('0x') ? rawAddress : null;

  // Is the ACTIVE wallet an app-created (Privy embedded) one? `connectorType`
  // alone is unreliable for Solana embedded wallets, so cross-check against the
  // user's linked accounts (the canonical source) by matching the address.
  const isEmbedded = useMemo(() => {
    if (!walletAddress) return false;
    if (activeWallet?.connectorType === 'embedded' && activeWallet.address === walletAddress) return true;
    const accts = (user?.linkedAccounts ?? []) as Array<{ type?: string; walletClientType?: string; address?: string }>;
    return accts.some(
      (a) => a.type === 'wallet' && a.walletClientType === 'privy' && a.address === walletAddress,
    );
  }, [activeWallet, user, walletAddress]);

  // The app-created EVM (Ethereum) embedded wallet — the HyperLiquid trading
  // account provisioned alongside the Solana one. Canonical source is
  // linkedAccounts; fall back to the wallets list.
  const evmAddress = useMemo(() => {
    const fromWallets = wallets.find(
      (w) => w.address?.startsWith('0x') && w.connectorType === 'embedded',
    )?.address;
    if (fromWallets) return fromWallets;
    const accts = (user?.linkedAccounts ?? []) as Array<{ type?: string; walletClientType?: string; address?: string }>;
    return accts.find(
      (a) => a.type === 'wallet' && a.walletClientType === 'privy' && (a.address ?? '').startsWith('0x'),
    )?.address ?? null;
  }, [wallets, user]);

  const publicKey = useMemo(() => {
    if (!walletAddress) return null;
    try {
      return new PublicKey(walletAddress);
    } catch {
      return null;
    }
  }, [walletAddress]);

  const sendTransaction = useCallback(
    async (transaction: Transaction): Promise<string> => {
      // Validate wallet session is still active before attempting to sign.
      // getAccessToken() checks the actual token  returns null if expired.
      const token = await getAccessToken();
      if (!token) {
        throw new Error(
          'SESSION_EXPIRED: Your wallet session has expired. Please log in again.',
        );
      }
      // Embedded-only: Privy's built-in send (silent, showWalletUIs:false).
      const receipt = await embeddedSend({ transaction, connection });
      return receipt.signature;
    },
    [embeddedSend, connection, getAccessToken],
  );

  /**
   * Gasless path: take a tx the server already built + partial-signed (authority
   * = feePayer, rent/ATA funded), have the EMBEDDED wallet add its signature
   * SILENTLY (showWalletUIs:false → no popup), then submit. The user needs zero
   * SOL. Embedded-only — external wallets keep the normal pay-your-own-gas flow.
   */
  const coSignAndSend = useCallback(
    async (serializedTxB64: string): Promise<string> => {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('SESSION_EXPIRED: Your wallet session has expired. Please log in again.');
      }
      const bytes = Uint8Array.from(atob(serializedTxB64), (c) => c.charCodeAt(0));
      const tx = Transaction.from(bytes);
      // Embedded wallet co-signs (silent, no broadcast) → fully-signed tx.
      const signed = (await embeddedSign({ transaction: tx, connection })) as Transaction;
      // Send with skipPreflight to avoid an extra simulate call (one more RPC hit
      // that 429s on a rate-limited devnet endpoint) — the server already built +
      // validated this tx. We deliberately do NOT confirm here: connection.
      // confirmTransaction uses signatureSubscribe (WebSocket), which throws a
      // TransactionExpiredTimeoutError under RPC 429s even when the tx actually
      // landed. The caller confirms via getSignatureStatus polling
      // (confirmTransactionWithRetry), which tolerates 429s and slow devnet.
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      });
      return sig;
    },
    [embeddedSign, connection, getAccessToken],
  );

  /**
   * Self-custody export: opens Privy's secure modal (key loaded in an iframe on a
   * separate domain — the app never sees it) so the user can copy their embedded
   * wallet's private key into Phantom/Solflare. Embedded-only.
   */
  const exportWallet = useCallback(async (): Promise<void> => {
    if (!walletAddress) return;
    await privyExportWallet({ address: walletAddress });
  }, [privyExportWallet, walletAddress]);

  /** Export the EVM (HyperLiquid trading) embedded wallet's private key. */
  const exportEvmWallet = useCallback(async (): Promise<void> => {
    if (!evmAddress) return;
    await privyExportEvmWallet({ address: evmAddress });
  }, [privyExportEvmWallet, evmAddress]);

  return {
    connected,
    publicKey,
    walletAddress,
    evmAddress,
    isEmbedded,
    sendTransaction,
    coSignAndSend,
    exportWallet,
    exportEvmWallet,
    login,
    logout,
  };
}
