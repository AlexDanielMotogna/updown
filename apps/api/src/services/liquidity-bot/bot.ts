import { Transaction, type Keypair } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { getPoolPDA, getVaultPDA, getUserBetPDA, buildDepositIx } from 'solana-client';
import { prisma } from '../../db';
import { getConnection, getUsdcMint, derivePoolSeed, getLiquidityBotKeypairs } from '../../utils/solana';
import { getLiquidityBotConfig } from './config';
import { fundBotWallet, getUsdcBalance, getFunderKeypair } from './funding';
import { recordConfirmedBet } from '../bet-recording';

type Side = 'UP' | 'DOWN' | 'DRAW';
const sideIndex = (s: Side): 0 | 1 | 2 => (s === 'UP' ? 0 : s === 'DOWN' ? 1 : 2);

function randBigInt(min: bigint, max: bigint): bigint {
  if (max <= min) return min;
  const range = Number(max - min);
  return min + BigInt(Math.floor(Math.random() * (range + 1)));
}
function minBig(...xs: bigint[]): bigint { return xs.reduce((a, b) => (b < a ? b : a)); }

async function placeBotDeposit(
  pool: { id: string }, wallet: Keypair, side: Side, amount: bigint,
): Promise<string> {
  const conn = getConnection();
  const seed = derivePoolSeed(pool.id);
  const [poolPda] = getPoolPDA(seed);
  const [vault] = getVaultPDA(seed);
  const idx = sideIndex(side);
  const [userBet] = getUserBetPDA(poolPda, wallet.publicKey, idx);
  const ata = await getOrCreateAssociatedTokenAccount(conn, wallet, getUsdcMint(), wallet.publicKey);

  const ix = buildDepositIx(poolPda, userBet, vault, ata.address, wallet.publicKey, idx, amount);
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash; tx.feePayer = wallet.publicKey; tx.sign(wallet);
  const sig = await conn.sendRawTransaction(tx.serialize(), { preflightCommitment: 'confirmed' });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

/**
 * One liquidity-bot pass: spreads small bets across every open pool, balancing
 * sides, respecting all DB-configured caps. Returns a short summary for logs.
 */
export async function runLiquidityBotCycle(): Promise<{ placed: number; spent: bigint }> {
  const cfg = await getLiquidityBotConfig();
  if (!cfg.enabled) return { placed: 0, spent: 0n };

  const wallets = getLiquidityBotKeypairs();
  if (wallets.length === 0) { console.warn('[LiquidityBot] no LIQUIDITY_BOT_KEYS configured'); return { placed: 0, spent: 0n }; }

  const funder = getFunderKeypair();
  if (!funder) { console.warn('[LiquidityBot] no funder (set TREASURY_SECRET_KEY on mainnet)'); return { placed: 0, spent: 0n }; }
  // Treasury floor guard (funder USDC must stay above the floor).
  const funderUsdc = await getUsdcBalance(funder.publicKey);
  if (funderUsdc < cfg.treasuryFloor) { console.warn('[LiquidityBot] funder below treasuryFloor, skipping'); return { placed: 0, spent: 0n }; }

  const botAddrs = wallets.map(w => w.publicKey.toBase58());

  // Current open exposure across all unresolved pools.
  const openBets = await prisma.bet.findMany({
    where: { walletAddress: { in: botAddrs }, pool: { status: { in: ['JOINING', 'ACTIVE'] } } },
    select: { amount: true },
  });
  let exposure = openBets.reduce((s, b) => s + b.amount, 0n);
  if (exposure >= cfg.maxTotalExposure) return { placed: 0, spent: 0n };

  const types: string[] = [];
  if (cfg.poolTypesCrypto) types.push('CRYPTO');
  if (cfg.poolTypesSports) types.push('SPORTS');
  if (cfg.poolTypesPm) types.push('POLYMARKET');
  if (types.length === 0) return { placed: 0, spent: 0n };

  const lockCutoff = new Date(Date.now() + cfg.lockMarginSeconds * 1000);
  const pools = await prisma.pool.findMany({
    where: { squadId: null, status: { in: ['JOINING', 'ACTIVE'] }, lockTime: { gt: lockCutoff }, poolType: { in: types } },
    select: { id: true, startTime: true, lockTime: true, numSides: true },
    orderBy: { lockTime: 'asc' },
    take: 60,
  });

  let cycleSpent = 0n;
  let placed = 0;

  for (const pool of pools) {
    if (cycleSpent >= cfg.perCycleCap || exposure >= cfg.maxTotalExposure) break;

    const poolBets = await prisma.bet.findMany({
      where: { poolId: pool.id, walletAddress: { in: botAddrs } },
      select: { amount: true, side: true, walletAddress: true },
    });
    const poolStake = poolBets.reduce((s, b) => s + b.amount, 0n);
    if (poolStake >= cfg.perPoolCap) continue;

    // Balanced: pick the side with the least bot stake.
    const sides: Side[] = pool.numSides === 3 ? ['UP', 'DOWN', 'DRAW'] : ['UP', 'DOWN'];
    const stakeBySide = new Map<Side, bigint>(sides.map(s => [s, 0n]));
    for (const b of poolBets) stakeBySide.set(b.side as Side, (stakeBySide.get(b.side as Side) ?? 0n) + b.amount);
    let side: Side = sides[0];
    for (const s of sides) if ((stakeBySide.get(s) ?? 0n) < (stakeBySide.get(side) ?? 0n)) side = s;

    // Prefer a wallet not yet on this side (more distinct bettors); else top up the first.
    const onSide = new Set(poolBets.filter(b => b.side === side).map(b => b.walletAddress));
    const wallet = wallets.find(w => !onSide.has(w.publicKey.toBase58())) ?? wallets[0];

    let amount = randBigInt(cfg.betMin, cfg.betMax);
    amount = minBig(amount, cfg.perPoolCap - poolStake, cfg.perCycleCap - cycleSpent, cfg.maxTotalExposure - exposure);
    if (amount <= 0n) continue;

    try {
      await fundBotWallet(wallet.publicKey, cfg.walletUsdcTopup, cfg.walletSolTopup);
      const sig = await placeBotDeposit(pool, wallet, side, amount);
      await recordConfirmedBet({ pool, walletAddress: wallet.publicKey.toBase58(), side, betAmount: amount, txSignature: sig });
      cycleSpent += amount; exposure += amount; placed++;
      console.log(`[LiquidityBot] +${Number(amount) / 1e6} USDC ${side} pool=${pool.id.slice(0, 8)} wallet=${wallet.publicKey.toBase58().slice(0, 6)}`);
    } catch (e) {
      console.warn(`[LiquidityBot] deposit failed pool=${pool.id.slice(0, 8)}:`, e instanceof Error ? e.message : e);
    }
  }

  if (placed > 0) console.log(`[LiquidityBot] cycle: ${placed} bets, ${Number(cycleSpent) / 1e6} USDC`);
  return { placed, spent: cycleSpent };
}

let running = false;
let timer: NodeJS.Timeout | null = null;

/** Self-rescheduling loop; re-reads intervalSeconds from config each pass. */
export function startLiquidityBotScheduler(): void {
  const loop = async () => {
    let delayMs = 20_000;
    try {
      const cfg = await getLiquidityBotConfig();
      delayMs = Math.max(5, cfg.intervalSeconds) * 1000;
      if (cfg.enabled && !running) {
        running = true;
        try { await runLiquidityBotCycle(); } finally { running = false; }
      }
    } catch (e) {
      console.error('[LiquidityBot] loop error:', e instanceof Error ? e.message : e);
    }
    timer = setTimeout(loop, delayMs);
  };
  console.log('[LiquidityBot] scheduler started (config-driven)');
  timer = setTimeout(loop, 8_000);
}
