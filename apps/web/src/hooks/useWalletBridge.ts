import { useCallback, useMemo } from 'react';
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

  // Prefer external wallet (has funds), fall back to embedded
  const activeWallet = useMemo(() => {
    if (!wallets.length) return null;
    return (
      wallets.find((w) => w.connectorType !== 'embedded') ??
      wallets.find((w) => w.connectorType === 'embedded') ??
      wallets[0]
    );
  }, [wallets]);

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

      // External wallet → sign via standard interface, send via RPC
      const stdWallet = standardWallets.find(
        (w) => w.address === walletAddress,
      );
      if (!stdWallet) throw new Error('Wallet not ready for signing');

      const serialized = transaction.serialize({
        requireAllSignatures: false,
      });
      const { signedTransaction } = await standardSign({
        transaction: serialized,
        wallet: stdWallet,
      });

      return await connection.sendRawTransaction(signedTransaction);
    },
    [
      isEmbedded,
      embeddedSend,
      standardSign,
      standardWallets,
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
