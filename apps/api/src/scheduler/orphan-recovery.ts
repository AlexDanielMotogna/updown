import { PublicKey, Transaction } from '@solana/web3.js';
import { PROGRAM_ID, buildResolveIx, buildResolveWithWinnerIx, buildClosePoolIx, buildForceClosePoolIx } from 'solana-client';
import { getConnection } from '../utils/solana';
import { ResolverDeps, logEvent } from './resolver-types';

/**
 * Scan on-chain for orphaned pools (exist on-chain but deleted from DB).
 * Resolves and closes them to reclaim rent back to the authority wallet.
 * Streams progress events via callback and throttles RPC calls.
 */
export async function recoverOrphanedPools(
  deps: ResolverDeps,
  onProgress?: (event: { type: string; message: string; [key: string]: unknown }) => void,
  shouldAbort?: () => boolean,
): Promise<{
  totalOnChain: number;
  totalInDb: number;
  orphaned: number;
  closed: number;
  skipped: number;
  failed: number;
  totalRentReclaimed: string;
}> {
  const connection = getConnection();
  const POOL_DISC = [241, 154, 109, 4, 17, 177, 109, 188];
  const STATUS_NAMES = ['Upcoming', 'Joining', 'Active', 'Resolved'];
  const RPC_DELAY = 1000; // 1s between pool operations to avoid 429s
  const emit = (type: string, message: string, extra?: Record<string, unknown>) => {
    onProgress?.({ type, message, ...extra });
  };
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  // 1. Scan on-chain
  emit('info', 'Scanning all program accounts on-chain...');
  const allAccounts = await connection.getProgramAccounts(PROGRAM_ID);
  const poolAccounts = allAccounts.filter(a => {
    if (a.account.data.length < 8) return false;
    return POOL_DISC.every((b, i) => a.account.data[i] === b);
  });

  // 2. Get DB pool PDAs
  const dbPools = await deps.prisma.pool.findMany({ select: { poolId: true } });
  const dbPoolPdas = new Set(dbPools.map(p => p.poolId));

  // 3. Find orphaned
  const orphaned = poolAccounts.filter(a => !dbPoolPdas.has(a.pubkey.toBase58()));

  emit('info', `Found ${poolAccounts.length} pools on-chain, ${dbPools.length} in DB, ${orphaned.length} orphaned`);
  emit('info', `Only recovering pools owned by authority ${deps.wallet.publicKey.toBase58().slice(0, 12)}...`);

  if (orphaned.length === 0) {
    emit('success', 'No orphaned pools found. All clean!');
    return { totalOnChain: poolAccounts.length, totalInDb: dbPools.length, orphaned: 0, closed: 0, skipped: 0, failed: 0, totalRentReclaimed: '0' };
  }

  let closed = 0;
  let skipped = 0;
  let failed = 0;
  let totalRentReclaimed = 0;

  for (let i = 0; i < orphaned.length; i++) {
    const account = orphaned[i];
    const data = account.account.data;
    const poolPdaStr = account.pubkey.toBase58();

    // Parse pool data (Borsh layout)
    let offset = 8;
    const poolSeed = data.slice(offset, offset + 32);
    offset += 32;
    const assetLen = data.readUInt32LE(offset);
    offset += 4;
    const asset = data.slice(offset, offset + assetLen).toString('utf8');
    offset += assetLen;
    // authority (32 bytes) — only recover pools owned by our wallet
    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    if (!authority.equals(deps.wallet.publicKey)) {
      continue; // belongs to a different authority, skip
    }
    // usdcMint (32 bytes)
    offset += 32;
    // vault pubkey (32 bytes) — read directly instead of deriving
    const vaultPubkey = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    // skip times(8*3) + prices(8*2) + totals(8*3) + num_sides(1)
    offset += 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1;
    const statusByte = data[offset];
    const status = STATUS_NAMES[statusByte] || `Unknown(${statusByte})`;

    // Check abort signal
    if (shouldAbort?.()) {
      emit('warn', `Stopped by user at pool ${i + 1}/${orphaned.length}`);
      break;
    }

    emit('pool_start', `[${i + 1}/${orphaned.length}] ${asset} pool ${poolPdaStr.slice(0, 12)}... (${status})`, { index: i + 1, total: orphaned.length, poolPda: poolPdaStr, asset, status });

    // Use vault read from pool data (not derived — old pools may have different derivation)
    const vaultPda = vaultPubkey;

    // Check vault balance
    let vaultBalance = 0;
    try {
      const balance = await connection.getTokenAccountBalance(vaultPda);
      vaultBalance = Number(balance.value.amount);
    } catch { /* vault closed */ }

    if (vaultBalance > 0) {
      const usdcAmount = (vaultBalance / 1e6).toFixed(2);
      emit('warn', `  SKIPPED — vault has ${usdcAmount} USDC (needs manual refund)`, { poolPda: poolPdaStr, vaultBalance });
      skipped++;
      await delay(RPC_DELAY);
      continue;
    }

    try {
      // Resolve if needed — try multiple strategies since deployed program
      // may not accept all statuses with all resolve variants
      if (statusByte !== 3) {
        emit('info', `  Resolving on-chain (status: ${status})...`);
        await delay(RPC_DELAY);

        let resolved = false;

        // Strategy 1: resolve by price (crypto pools)
        try {
          const resolveIx = buildResolveIx(account.pubkey, deps.wallet.publicKey, BigInt(1000), BigInt(1000));
          const resolveTx = new Transaction().add(resolveIx);
          const { blockhash: rb, lastValidBlockHeight: rvbh } = await connection.getLatestBlockhash();
          resolveTx.recentBlockhash = rb;
          resolveTx.feePayer = deps.wallet.publicKey;
          resolveTx.sign(deps.wallet);

          const resolveSig = await connection.sendRawTransaction(resolveTx.serialize(), {
            skipPreflight: false, preflightCommitment: 'confirmed',
          });
          await connection.confirmTransaction(
            { signature: resolveSig, blockhash: rb, lastValidBlockHeight: rvbh }, 'confirmed',
          );
          emit('info', `  Resolved (by price): ${resolveSig.slice(0, 20)}...`);
          resolved = true;
        } catch (resolveErr) {
          const msg = resolveErr instanceof Error ? resolveErr.message : String(resolveErr);
          if (msg.includes('InvalidPoolStatus') || msg.includes('0x177a')) {
            // Status not accepted by resolve — try resolve_with_winner
            emit('info', `  resolve rejected status ${status}, trying resolve_with_winner...`);
            await delay(RPC_DELAY);

            try {
              const resolveIx2 = buildResolveWithWinnerIx(account.pubkey, deps.wallet.publicKey, 0);
              const resolveTx2 = new Transaction().add(resolveIx2);
              const { blockhash: rb2, lastValidBlockHeight: rvbh2 } = await connection.getLatestBlockhash();
              resolveTx2.recentBlockhash = rb2;
              resolveTx2.feePayer = deps.wallet.publicKey;
              resolveTx2.sign(deps.wallet);

              const resolveSig2 = await connection.sendRawTransaction(resolveTx2.serialize(), {
                skipPreflight: false, preflightCommitment: 'confirmed',
              });
              await connection.confirmTransaction(
                { signature: resolveSig2, blockhash: rb2, lastValidBlockHeight: rvbh2 }, 'confirmed',
              );
              emit('info', `  Resolved (with winner): ${resolveSig2.slice(0, 20)}...`);
              resolved = true;
            } catch (resolveErr2) {
              const msg2 = resolveErr2 instanceof Error ? resolveErr2.message : String(resolveErr2);
              if (msg2.includes('InvalidPoolStatus') || msg2.includes('0x177a') || msg2.includes('PoolNotEnded')) {
                emit('warn', `  SKIPPED — deployed program rejects ${status} pools. Deploy updated program to fix.`, { poolPda: poolPdaStr, status });
                skipped++;
                await delay(RPC_DELAY);
                continue;
              }
              throw resolveErr2; // Unknown error, bubble up
            }
          } else if (msg.includes('PoolNotEnded')) {
            emit('warn', `  SKIPPED — pool end_time not reached yet`, { poolPda: poolPdaStr });
            skipped++;
            await delay(RPC_DELAY);
            continue;
          } else {
            throw resolveErr; // Unknown error, bubble up
          }
        }

        if (!resolved) {
          skipped++;
          await delay(RPC_DELAY);
          continue;
        }
      }

      // Close pool — attempt to reclaim rent
      emit('info', `  Closing pool to reclaim rent...`);
      await delay(RPC_DELAY);

      try {
        const balanceBefore = await connection.getBalance(deps.wallet.publicKey);
        const closeIx = buildClosePoolIx(account.pubkey, vaultPda, deps.wallet.publicKey);
        const closeTx = new Transaction().add(closeIx);
        const { blockhash: cb, lastValidBlockHeight: cvbh } = await connection.getLatestBlockhash();
        closeTx.recentBlockhash = cb;
        closeTx.feePayer = deps.wallet.publicKey;
        closeTx.sign(deps.wallet);

        const closeSig = await connection.sendRawTransaction(closeTx.serialize(), {
          skipPreflight: false, preflightCommitment: 'confirmed',
        });
        await connection.confirmTransaction(
          { signature: closeSig, blockhash: cb, lastValidBlockHeight: cvbh }, 'confirmed',
        );

        const balanceAfter = await connection.getBalance(deps.wallet.publicKey);
        const rentReclaimed = balanceAfter - balanceBefore;
        totalRentReclaimed += rentReclaimed;

        await logEvent(deps.prisma, 'POOL_ORPHAN_RECOVERED', 'closure', poolPdaStr, {
          poolPda: poolPdaStr, asset, previousStatus: status,
          rentReclaimedLamports: rentReclaimed.toString(),
          rentReclaimedSol: (rentReclaimed / 1e9).toFixed(6),
          txSignature: closeSig,
        });

        emit('success', `  CLOSED — reclaimed ${(rentReclaimed / 1e9).toFixed(6)} SOL (tx: ${closeSig.slice(0, 20)}...)`, {
          poolPda: poolPdaStr, rentReclaimed: (rentReclaimed / 1e9).toFixed(6), txSignature: closeSig,
        });
        closed++;
      } catch (closeErr) {
        // Normal close failed — try force_close (bypasses vault seeds check)
        try {
          emit('info', `  Normal close failed, trying force_close...`);
          await delay(RPC_DELAY);

          const forceIx = buildForceClosePoolIx(account.pubkey, deps.wallet.publicKey);
          const forceTx = new Transaction().add(forceIx);
          const { blockhash: fb, lastValidBlockHeight: fvbh } = await connection.getLatestBlockhash();
          forceTx.recentBlockhash = fb;
          forceTx.feePayer = deps.wallet.publicKey;
          forceTx.sign(deps.wallet);

          const forceSig = await connection.sendRawTransaction(forceTx.serialize(), {
            skipPreflight: false, preflightCommitment: 'confirmed',
          });
          await connection.confirmTransaction(
            { signature: forceSig, blockhash: fb, lastValidBlockHeight: fvbh }, 'confirmed',
          );

          const balanceAfterForce = await connection.getBalance(deps.wallet.publicKey);
          emit('success', `  FORCE CLOSED (tx: ${forceSig.slice(0, 20)}...)`, { poolPda: poolPdaStr, txSignature: forceSig });
          closed++;
        } catch (forceErr) {
          // Both close methods failed — pool is still resolved (safe)
          emit('warn', `  RESOLVED but close failed. Pool is safe — no deposits possible.`, { poolPda: poolPdaStr });
          closed++;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      emit('error', `  FAILED — ${msg}`, { poolPda: poolPdaStr, error: msg });
      failed++;
    }

    await delay(RPC_DELAY);
  }

  const totalSol = (totalRentReclaimed / 1e9).toFixed(6);
  emit('complete', `Done! Closed: ${closed}, Skipped: ${skipped}, Failed: ${failed}. Total rent reclaimed: ${totalSol} SOL`, {
    closed, skipped, failed, totalRentReclaimed: totalSol,
  });

  return { totalOnChain: poolAccounts.length, totalInDb: dbPools.length, orphaned: orphaned.length, closed, skipped, failed, totalRentReclaimed: totalSol };
}
