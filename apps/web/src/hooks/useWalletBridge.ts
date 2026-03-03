import { useCallback, useMemo, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import {
  useSendTransaction,
  useConnectedStandardWallets,
  useStandardSignTransaction,
} from '@privy-io/react-auth/solana';
import { Transaction, PublicKey } from '@solana/web3.js';
import { useSolanaConnection } from '@/app/providers';

export function useWalletBridge() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { wallets: standardWallets } = useConnectedStandardWallets();
  const connection = useSolanaConnection();
  const { sendTransaction: embeddedSend } = useSendTransaction();
  const { signTransaction: standardSign } = useStandardSignTransaction();

  // Keep a ref to standardWallets so the sendTransaction callback
  // always sees the latest value (avoids stale closure)
  const standardWalletsRef = useRef(standardWallets);
  standardWalletsRef.current = standardWallets;

  // Prefer external wallet ONLY if its standard adapter is connected,
  // otherwise fall back to embedded (avoids building transactions for a
  // wallet that can't actually sign — e.g. deployed env without extension)
  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;

    const external = wallets.find((w) => w.connectorType !== 'embedded');
    const hasAdapter = external && standardWallets.some((sw) => sw.address === external.address);

    if (external && hasAdapter) return external;

    return (
      wallets.find((w) => w.connectorType === 'embedded') ??
      wallets[0]
    );
  }, [wallets, standardWallets]);

  const isEmbedded = activeWallet?.connectorType === 'embedded';
  const connected = ready && authenticated;

  const walletAddress =
    activeWallet?.address ?? user?.wallet?.address ?? null;

  const publicKey = useMemo(
    () => (walletAddress ? new PublicKey(walletAddress) : null),
    [walletAddress],
  );

  const sendTransaction = useCallback(
    async (transaction: Transaction): Promise<string> => {
      // Embedded wallet → use Privy's built-in send
      if (isEmbedded) {
        const receipt = await embeddedSend({ transaction, connection });
        return receipt.signature;
      }

      // External wallet → try standard wallet adapter first
      const findStdWallet = () =>
        standardWalletsRef.current.find((w) => w.address === walletAddress);

      let stdWallet = findStdWallet();

      // Standard wallet adapter may still be auto-connecting — wait briefly
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
        const { signedTransaction } = await standardSign({
          transaction: serialized,
          wallet: stdWallet,
        });
        return await connection.sendRawTransaction(signedTransaction);
      }

      throw new Error(
        'Wallet not available for signing. Please reconnect your wallet or refresh the page.',
      );
    },
    [
      isEmbedded,
      embeddedSend,
      standardSign,
      walletAddress,
      connection,
    ],
  );

  return {
    connected,
    publicKey,
    walletAddress,
    sendTransaction,
    login,
    logout,
  };
}
