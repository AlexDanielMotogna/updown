import { prisma } from '../../db';
import { Transaction } from '@solana/web3.js';
import { getPoolPDA, buildResolveWithWinnerIx } from 'solana-client';
import { derivePoolSeed, getConnection, getAuthorityKeypair } from '../../utils/solana';
import { emitPoolStatus } from '../../websocket';
import { awardBetResolution } from '../rewards';
import { getCachedFixtureResults } from '../sports/fixture-cache';
import { notifyPoolResolved } from '../notifications';

/**
 * Settle POLYMARKET pools on-chain once their market has resolved.
 *
 * This is the on-chain half of PM resolution, now self-contained in the PM
 * domain (the detection half lives in polymarket-sync `resolutionPoll`, which
 * marks the PM cache FINISHED via CTF-first). Scoped to `poolType: 'POLYMARKET'`
 * and gated on `endTime` (the market deadline) — it never touches the sports
 * `resolveMatchPools` path, which now sees only real sports pools.
 *
 * PM markets are binary Yes/No: HOME = Yes = side 0 (UP), AWAY = No = side 1 (DOWN).
 */
export async function resolvePolymarketPools(): Promise<void> {
  const pools = await prisma.pool.findMany({
    where: {
      poolType: 'POLYMARKET',
      status: { in: ['JOINING', 'ACTIVE'] },
      matchId: { not: null },
      endTime: { lte: new Date() }, // market deadline passed
    },
  });
  if (pools.length === 0) return;

  const matchIds = [...new Set(pools.map(p => p.matchId!).filter(Boolean))];
  const resultMap = await getCachedFixtureResults(matchIds);

  const connection = getConnection();
  const wallet = getAuthorityKeypair();
  let resolved = 0;

  for (const pool of pools) {
    if (!pool.matchId) continue;
    const result = resultMap.get(pool.matchId);
    if (!result) continue; // market not settled yet (resolutionPoll hasn't marked it FINISHED)

    try {
      const winnerSide: 0 | 1 = result.winner === 'AWAY' ? 1 : 0;
      const winnerLabel = winnerSide === 0 ? 'UP' : 'DOWN';

      // Surface the final result in the UI immediately.
      await prisma.pool.update({
        where: { id: pool.id },
        data: { homeScore: result.homeScore, awayScore: result.awayScore },
      });

      const seed = derivePoolSeed(pool.id);
      const [poolPda] = getPoolPDA(seed);
      const ix = buildResolveWithWinnerIx(poolPda, wallet.publicKey, winnerSide);
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);

      try {
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('InvalidPoolStatus') || msg.includes('0x177a') || msg.includes('AccountNotInitialized')) {
          // Already resolved on-chain (a previous tick raced) — sync the DB below.
        } else if (msg.includes('AccountDidNotSerialize') || msg.includes('0xbbc')) {
          console.error(`[PM] STALE-LAYOUT pool needs admin refund: ${pool.id} (${pool.asset})`);
          continue;
        } else {
          throw err;
        }
      }

      await prisma.pool.update({
        where: { id: pool.id },
        data: { status: 'RESOLVED', winner: winnerLabel, finalPrice: BigInt(0) },
      });
      emitPoolStatus(pool.id, { id: pool.id, status: 'RESOLVED', winner: winnerLabel });
      notifyPoolResolved({ ...pool, winner: winnerLabel }).catch(() => {});

      // Participation XP for every bettor (real-world outcome, not farmable).
      const xpBettors = await prisma.bet.findMany({ where: { poolId: pool.id }, select: { walletAddress: true } });
      const xpWallets = [...new Set(xpBettors.map(b => b.walletAddress))];
      await Promise.all(xpWallets.map(w => awardBetResolution(w)));

      resolved++;
      console.log(`[PM] Resolved ${pool.asset} → ${winnerLabel}`);
    } catch (error) {
      console.error(`[PM] Failed to resolve pool ${pool.id}:`, error);
    }
  }

  if (resolved > 0) console.log(`[PM] Settled ${resolved}/${pools.length} resolved Polymarket pools on-chain`);
}
