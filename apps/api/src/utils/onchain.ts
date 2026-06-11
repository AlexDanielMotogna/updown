import { Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getConnection } from './solana';

export interface SendAndConfirmOptions {
  /** Label surfaced in the error message (e.g. 'refund_bettor'). */
  label?: string;
  /** Skip preflight simulation. Defaults to false. */
  skipPreflight?: boolean;
}

/**
 * Build, sign, send and confirm a transaction from one or more instructions.
 *
 * Centralizes the blockhash → sign → sendRawTransaction → confirmTransaction →
 * error-check boilerplate that was copy-pasted across ~15 files. Having the
 * money-moving send path in ONE place means retry/confirmation/error semantics
 * are consistent and testable, instead of subtly diverging per call site.
 *
 * Always routes through the rotating RpcConnectionManager (`getConnection()`),
 * so failover + backoff apply uniformly.
 */
export async function sendAndConfirm(
  ixs: TransactionInstruction | TransactionInstruction[],
  payer: Keypair,
  opts: SendAndConfirmOptions = {},
): Promise<string> {
  const connection = getConnection();
  const tx = new Transaction();
  for (const ix of Array.isArray(ixs) ? ixs : [ixs]) tx.add(ix);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: opts.skipPreflight ?? false,
    preflightCommitment: 'confirmed',
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  if (confirmation.value.err) {
    throw new Error(`${opts.label ?? 'tx'} failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  return signature;
}
