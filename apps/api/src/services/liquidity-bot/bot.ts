import { Transaction, type Keypair } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { getPoolPDA, getVaultPDA, getUserBetPDA, buildDepositIx } from 'solana-client';
import { prisma } from '../../db';
import { getConnection, getUsdcMint, derivePoolSeed, getLiquidityBotKeypairs, isDevnet } from '../../utils/solana';
import { sendAndConfirm } from '../../utils/onchain';
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

/** Deterministic [0,1) from a string (FNV-1a). Same pool id → same value, so a
 *  pool's target volume is stable across cycles instead of drifting up to cap. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** Per-pool stake target: a stable, per-pool-random fraction of perPoolCap in
 *  [1 - variance, 1]. variancePct=0 → always the full cap (old behavior). Never
 *  goes below betMin so a chosen pool can still place at least one bet. */
function poolTarget(poolId: string, perPoolCap: bigint, betMin: bigint, variancePct: number): bigint {
  const v = Math.max(0, Math.min(100, variancePct)) / 100;
  if (v === 0) return perPoolCap;
  const factor = 1 - v + hash01(poolId) * v;
  const target = BigInt(Math.floor(Number(perPoolCap) * factor));
  return target < betMin ? betMin : target;
}

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
  return await sendAndConfirm(ix, wallet, { label: 'bot-deposit' });
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
  // Treasury floor guard — only on mainnet (real, finite USDC). On devnet the
  // funder is the mint authority (unlimited mint, doesn't hold USDC), so the
  // floor check would wrongly block the bot.
  if (!isDevnet()) {
    const funderUsdc = await getUsdcBalance(funder.publicKey);
    if (funderUsdc < cfg.treasuryFloor) { console.warn('[LiquidityBot] funder below treasuryFloor, skipping'); return { placed: 0, spent: 0n }; }
  }

  const botAddrs = wallets.map(w => w.publicKey.toBase58());

  // Current open exposure across all unresolved pools.
  const openBets = await prisma.bet.findMany({
    where: { walletAddress: { in: botAddrs }, pool: { status: { in: ['JOINING', 'ACTIVE'] } } },
    select: { amount: true },
  });
  let exposure = openBets.reduce((s, b) => s + b.amount, 0n);
  if (exposure >= cfg.maxTotalExposure) return { placed: 0, spent: 0n };

  // Targeted mode: a non-empty targetPoolIds list pins the bot to those pools
  // only (ignoring the poolTypes filter) until the admin clears the list or
  // stops the bot. Empty list = default behavior (all open pools by type).
  const targetIds = Array.isArray(cfg.targetPoolIds) ? cfg.targetPoolIds.filter(Boolean) : [];
  const targeting = targetIds.length > 0;

  const types: string[] = [];
  if (cfg.poolTypesCrypto) types.push('CRYPTO');
  if (cfg.poolTypesSports) types.push('SPORTS');
  if (cfg.poolTypesPm) types.push('POLYMARKET');
  if (!targeting && types.length === 0) return { placed: 0, spent: 0n };

  const lockCutoff = new Date(Date.now() + cfg.lockMarginSeconds * 1000);
  const pools = await prisma.pool.findMany({
    where: {
      squadId: null,
      status: { in: ['JOINING', 'ACTIVE'] },
      lockTime: { gt: lockCutoff },
      ...(targeting ? { id: { in: targetIds } } : { poolType: { in: types } }),
    },
    select: { id: true, startTime: true, lockTime: true, numSides: true },
    orderBy: { createdAt: 'desc' }, // freshest pools first = highest time-weight
    take: targeting ? targetIds.length : 60,
  });

  let cycleSpent = 0n;
  let placed = 0;

  for (const pool of pools) {
    if (cycleSpent >= cfg.perCycleCap || exposure >= cfg.maxTotalExposure) break;

    const poolBets = await prisma.bet.findMany({
      where: { poolId: pool.id, walletAddress: { in: botAddrs } },
      select: { amount: true, side: true, walletAddress: true },
    });
    let poolStake = poolBets.reduce((s, b) => s + b.amount, 0n);
    // Stake target for THIS pool — a stable fraction of the cap so pools don't
    // all show the same volume (configurable via perPoolVariancePct).
    const effCap = poolTarget(pool.id, cfg.perPoolCap, cfg.betMin, cfg.perPoolVariancePct);
    if (poolStake >= effCap) continue;

    // Cover EVERY side this pass — whichever wins, the bot recaptures the pot
    // (minus fee) instead of losing a one-sided position. effCap is split
    // evenly across sides. Pools are processed freshest-first so these bets land
    // with the highest possible time-weight.
    const sides: Side[] = pool.numSides === 3 ? ['UP', 'DOWN', 'DRAW'] : ['UP', 'DOWN'];
    const perSideTarget = effCap / BigInt(sides.length);
    const stakeBySide = new Map<Side, bigint>(sides.map(s => [s, 0n]));
    const walletsBySide = new Map<Side, Set<string>>(sides.map(s => [s, new Set<string>()]));
    for (const b of poolBets) {
      stakeBySide.set(b.side as Side, (stakeBySide.get(b.side as Side) ?? 0n) + b.amount);
      walletsBySide.get(b.side as Side)?.add(b.walletAddress);
    }

    for (const side of sides) {
      if (cycleSpent >= cfg.perCycleCap || exposure >= cfg.maxTotalExposure || poolStake >= effCap) break;
      const sideStake = stakeBySide.get(side) ?? 0n;
      if (sideStake >= perSideTarget) continue;

      // Random eligible wallet (not already on this side here) for distinct bettors.
      const onSide = walletsBySide.get(side) ?? new Set<string>();
      const eligible = wallets.filter(w => !onSide.has(w.publicKey.toBase58()));
      if (eligible.length === 0) continue;
      const wallet = eligible[Math.floor(Math.random() * eligible.length)];

      let amount = randBigInt(cfg.betMin, cfg.betMax);
      amount = minBig(amount, perSideTarget - sideStake, effCap - poolStake, cfg.perCycleCap - cycleSpent, cfg.maxTotalExposure - exposure);
      if (amount <= 0n) continue;

      try {
        await fundBotWallet(wallet.publicKey, cfg.walletUsdcTopup, cfg.walletSolTopup);
        const sig = await placeBotDeposit(pool, wallet, side, amount);
        await recordConfirmedBet({ pool, walletAddress: wallet.publicKey.toBase58(), side, betAmount: amount, txSignature: sig });
        cycleSpent += amount; exposure += amount; poolStake += amount; placed++;
        stakeBySide.set(side, sideStake + amount);
        onSide.add(wallet.publicKey.toBase58());
        console.log(`[LiquidityBot] +${Number(amount) / 1e6} USDC ${side} pool=${pool.id.slice(0, 8)} wallet=${wallet.publicKey.toBase58().slice(0, 6)}`);
      } catch (e) {
        console.warn(`[LiquidityBot] deposit failed pool=${pool.id.slice(0, 8)}:`, e instanceof Error ? e.message : e);
      }
      // Throttle: space out the RPC-heavy fund+deposit+confirm calls so the bot
      // doesn't burst hundreds of requests per cycle and trigger 429s.
      await new Promise(r => setTimeout(r, 400));
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
