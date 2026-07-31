import { type Keypair } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { getPoolPDA, getVaultPDA, getUserBetPDA, buildDepositIx } from 'solana-client';
import { prisma } from '../../db';
import { getConnection, getUsdcMint, derivePoolSeed, getEventBotKeypairs, isDevnet } from '../../utils/solana';
import { sendAndConfirm } from '../../utils/onchain';
import { getEventBotConfig } from './config';
import { fundBotWallet, getUsdcBalance, getFunderKeypair } from '../liquidity-bot/funding';
import { recordConfirmedBet } from '../bet-recording';

/**
 * Event Bots — same betting engine as the liquidity bot, but hard-scoped to the
 * Crypto Predictions event: only CRYPTO 5-minute pools (BTC/ETH/SOL), separate
 * wallets (EVENT_BOT_KEYS) and config (EventBotConfig). Reuses the funding +
 * on-chain deposit + bet-recording machinery.
 */

const EVENT_ASSETS = ['BTC', 'ETH', 'SOL'];
const EVENT_INTERVAL = '5m';

type Side = 'UP' | 'DOWN';
const sideIndex = (s: Side): 0 | 1 => (s === 'UP' ? 0 : 1);

export interface EventBotDiagnostics {
  at: string | null;
  enabled: boolean;
  reason: string | null;
  poolsConsidered: number;
  placed: number;
  spent: string;
  lastError: string | null;
  lastErrorAt: string | null;
}
let diag: EventBotDiagnostics = { at: null, enabled: false, reason: null, poolsConsidered: 0, placed: 0, spent: '0', lastError: null, lastErrorAt: null };
export function getEventBotDiagnostics(): EventBotDiagnostics { return diag; }

function randBigInt(min: bigint, max: bigint): bigint {
  if (max <= min) return min;
  return min + BigInt(Math.floor(Math.random() * (Number(max - min) + 1)));
}
function minBig(...xs: bigint[]): bigint { return xs.reduce((a, b) => (b < a ? b : a)); }
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
function poolTarget(poolId: string, perPoolCap: bigint, betMin: bigint, variancePct: number): bigint {
  const v = Math.max(0, Math.min(100, variancePct)) / 100;
  if (v === 0) return perPoolCap;
  const target = BigInt(Math.floor(Number(perPoolCap) * (1 - v + hash01(poolId) * v)));
  return target < betMin ? betMin : target;
}

async function placeBotDeposit(pool: { id: string }, wallet: Keypair, side: Side, amount: bigint): Promise<string> {
  const conn = getConnection();
  const seed = derivePoolSeed(pool.id);
  const [poolPda] = getPoolPDA(seed);
  const [vault] = getVaultPDA(seed);
  const idx = sideIndex(side);
  const [userBet] = getUserBetPDA(poolPda, wallet.publicKey, idx);
  const ata = await getOrCreateAssociatedTokenAccount(conn, wallet, getUsdcMint(), wallet.publicKey);
  const ix = buildDepositIx(poolPda, userBet, vault, ata.address, wallet.publicKey, idx, amount);
  return await sendAndConfirm(ix, wallet, { label: 'event-bot-deposit' });
}

/** One event-bot pass: spreads small bets across every open CRYPTO 5m pool, both sides. */
export async function runEventBotCycle(): Promise<{ placed: number; spent: bigint }> {
  const cfg = await getEventBotConfig();
  diag = { ...diag, at: new Date().toISOString(), enabled: cfg.enabled, reason: null, poolsConsidered: 0, placed: 0, spent: '0' };
  if (!cfg.enabled) { diag.reason = 'bot disabled'; return { placed: 0, spent: 0n }; }

  const wallets = getEventBotKeypairs();
  if (wallets.length === 0) { diag.reason = 'no EVENT_BOT_KEYS configured'; console.warn('[EventBot] no EVENT_BOT_KEYS configured'); return { placed: 0, spent: 0n }; }

  const funder = getFunderKeypair();
  if (!funder) { diag.reason = 'no funder (TREASURY_SECRET_KEY not set)'; console.warn('[EventBot] no funder'); return { placed: 0, spent: 0n }; }
  if (!isDevnet()) {
    const funderUsdc = await getUsdcBalance(funder.publicKey);
    if (funderUsdc < cfg.treasuryFloor) { diag.reason = 'funder below treasury floor'; return { placed: 0, spent: 0n }; }
  }

  const botAddrs = wallets.map((w) => w.publicKey.toBase58());
  const openBets = await prisma.bet.findMany({ where: { walletAddress: { in: botAddrs }, pool: { status: { in: ['JOINING', 'ACTIVE'] } } }, select: { amount: true } });
  let exposure = openBets.reduce((s, b) => s + b.amount, 0n);
  if (exposure >= cfg.maxTotalExposure) { diag.reason = 'max total exposure reached'; return { placed: 0, spent: 0n }; }

  const lockCutoff = new Date(Date.now() + cfg.lockMarginSeconds * 1000);
  const pools = await prisma.pool.findMany({
    where: {
      poolType: 'CRYPTO', interval: EVENT_INTERVAL, asset: { in: EVENT_ASSETS }, squadId: null,
      status: { in: ['JOINING', 'ACTIVE'] }, lockTime: { gt: lockCutoff },
    },
    select: { id: true, startTime: true, lockTime: true, numSides: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  diag.poolsConsidered = pools.length;

  let cycleSpent = 0n;
  let placed = 0;

  for (const pool of pools) {
    if (cycleSpent >= cfg.perCycleCap || exposure >= cfg.maxTotalExposure) break;

    const poolBets = await prisma.bet.findMany({ where: { poolId: pool.id, walletAddress: { in: botAddrs } }, select: { amount: true, side: true, walletAddress: true } });
    let poolStake = poolBets.reduce((s, b) => s + b.amount, 0n);
    const effCap = poolTarget(pool.id, cfg.perPoolCap, cfg.betMin, cfg.perPoolVariancePct);
    if (poolStake >= effCap) continue;

    const sides: Side[] = ['UP', 'DOWN'];
    const perSideTarget = effCap / 2n;
    const stakeBySide = new Map<Side, bigint>(sides.map((s) => [s, 0n]));
    const walletsBySide = new Map<Side, Set<string>>(sides.map((s) => [s, new Set<string>()]));
    for (const b of poolBets) {
      if (b.side !== 'UP' && b.side !== 'DOWN') continue;
      stakeBySide.set(b.side, (stakeBySide.get(b.side) ?? 0n) + b.amount);
      walletsBySide.get(b.side)?.add(b.walletAddress);
    }

    for (const side of sides) {
      if (cycleSpent >= cfg.perCycleCap || exposure >= cfg.maxTotalExposure || poolStake >= effCap) break;
      const sideStake = stakeBySide.get(side) ?? 0n;
      if (sideStake >= perSideTarget) continue;

      const onSide = walletsBySide.get(side) ?? new Set<string>();
      const eligible = wallets.filter((w) => !onSide.has(w.publicKey.toBase58()));
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
        console.log(`[EventBot] +${Number(amount) / 1e6} USDC ${side} pool=${pool.id.slice(0, 8)}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        diag.lastError = `deposit pool=${pool.id.slice(0, 8)}: ${msg}`.slice(0, 300);
        diag.lastErrorAt = new Date().toISOString();
        console.warn(`[EventBot] deposit failed pool=${pool.id.slice(0, 8)}:`, msg);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  diag.placed = placed;
  diag.spent = cycleSpent.toString();
  if (placed === 0 && !diag.reason) {
    diag.reason = pools.length === 0 ? 'no open CRYPTO 5m pools' : diag.lastError ? 'all deposits failing (see last error)' : 'pools already at target volume';
  }
  if (placed > 0) console.log(`[EventBot] cycle: ${placed} bets, ${Number(cycleSpent) / 1e6} USDC`);
  return { placed, spent: cycleSpent };
}

let running = false;
let timer: NodeJS.Timeout | null = null;

/** Self-rescheduling loop; re-reads intervalSeconds from config each pass. */
export function startEventBotScheduler(): void {
  const loop = async () => {
    let delayMs = 30_000;
    try {
      const cfg = await getEventBotConfig();
      delayMs = Math.max(5, cfg.intervalSeconds) * 1000;
      if (cfg.enabled && !running) {
        running = true;
        try { await runEventBotCycle(); } finally { running = false; }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      diag.lastError = `loop: ${msg}`.slice(0, 300);
      diag.lastErrorAt = new Date().toISOString();
      diag.reason = 'cycle threw (see last error)';
      console.error('[EventBot] loop error:', msg);
    }
    timer = setTimeout(loop, delayMs);
  };
  console.log('[EventBot] scheduler started (config-driven)');
  timer = setTimeout(loop, 10_000);
}
