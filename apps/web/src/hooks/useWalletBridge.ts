import { useCallback, useMemo, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import {
  useSendTransaction,
  useSignTransaction,
  useConnectedStandardWallets,
  useStandardSignAndSendTransaction,
} from '@privy-io/react-auth/solana';
import { Transaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { useSolanaConnection } from '@/app/providers';

export function useWalletBridge() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { wallets: standardWallets } = useConnectedStandardWallets();
  const connection = useSolanaConnection();
  const { sendTransaction: embeddedSend } = useSendTransaction();
  const { signTransaction: embeddedSign } = useSignTransaction();
  const { signAndSendTransaction: standardSignAndSend } = useStandardSignAndSendTransaction();

  // Keep a ref to standardWallets so the sendTransaction callback
  // always sees the latest value (avoids stale closure)
  const standardWalletsRef = useRef(standardWallets);
  standardWalletsRef.current = standardWallets;

  // Prefer external wallet ONLY if its standard adapter is connected,
  // otherwise fall back to embedded (avoids building transactions for a
  // wallet that can't actually sign  e.g. deployed env without extension).
  // SOLANA-ONLY: a user can also link an EVM wallet (0x…) for the trading
  // terminal — that must NEVER be treated as the Solana signer (new PublicKey
  // would throw "Non-base58 character" and break the whole app).
  const activeWallet = useMemo(() => {
    const sol = wallets.filter((w) => !w.address.startsWith('0x'));
    if (!sol.length) return null;

    const external = sol.find((w) => w.connectorType !== 'embedded');
    const hasAdapter = external && standardWallets.some((sw) => sw.address === external.address);

    if (external && hasAdapter) return external;

    return (
      sol.find((w) => w.connectorType === 'embedded') ??
      sol[0]
    );
  }, [wallets, standardWallets]);

  const isEmbedded = activeWallet?.connectorType === 'embedded';
  const connected = ready && authenticated;

  // Never let an EVM address through as the Solana wallet identity.
  const rawAddress = activeWallet?.address ?? user?.wallet?.address ?? null;
  const walletAddress = rawAddress && !rawAddress.startsWith('0x') ? rawAddress : null;

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

      // Embedded wallet → use Privy's built-in send
      if (isEmbedded) {
        const receipt = await embeddedSend({ transaction, connection });
        return receipt.signature;
      }

      // External wallet → try standard wallet adapter first
      const findStdWallet = () =>
        standardWalletsRef.current.find((w) => w.address === walletAddress);

      let stdWallet = findStdWallet();

      // Standard wallet adapter may still be auto-connecting  wait briefly
      if (!stdWallet) {
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 500));
          stdWallet = findStdWallet();
          if (stdWallet) break;
        }
      }

      if (stdWallet) {
        const serialized = transaction.serialize({
          requireAllSignatures: false,
        });
        const { signature } = await standardSignAndSend({
          transaction: serialized,
          wallet: stdWallet,
          chain: 'solana:devnet',
        });
        return bs58.encode(signature);
      }

      throw new Error(
        'Wallet not available for signing. Please reconnect your wallet or refresh the page.',
      );
    },
    [
      isEmbedded,
      embeddedSend,
      standardSignAndSend,
      walletAddress,
      connection,
      getAccessToken,
    ],
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
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    },
    [embeddedSign, connection, getAccessToken],
  );

  return {
    connected,
    publicKey,
    walletAddress,
    isEmbedded,
    sendTransaction,
    coSignAndSend,
    login,
    logout,
  };
}
