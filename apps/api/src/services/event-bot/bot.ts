import { type Keypair } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { getPoolPDA, getVaultPDA, getUserBetPDA, buildDepositIx } from 'solana-client';
import { prisma } from '../../db';
import { getConnection, getUsdcMint, derivePoolSeed, getEventBotKeypairs, isDevnet } from '../../utils/solana';
import { sendAndConfirm } from '../../utils/onchain';
import { getEventBotConfig } from './config';
import { fundBotWallet, getUsdcBalance, getFunderKeypair } from '../liquidity-bot/funding';
import { recordConfirmedBet } from '../bet-recording';
import { getPriceAtOrBefore } from '../price-history';

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

/**
 * Assign each bot wallet to ONE side for a given pool (no hedging): with 6 bots
 * that's 3 UP / 3 DOWN. Ordering is pool-seeded so which specific bots land on
 * each side varies per pool, but a wallet is always single-sided within a pool.
 */
function assignSides(poolId: string, wallets: Keypair[]): Map<string, Side> {
  const ordered = [...wallets].sort(
    (a, b) => hash01(poolId + a.publicKey.toBase58()) - hash01(poolId + b.publicKey.toBase58()),
  );
  const half = Math.floor(ordered.length / 2);
  const map = new Map<string, Side>();
  ordered.forEach((w, i) => map.set(w.publicKey.toBase58(), i < half ? 'UP' : 'DOWN'));
  return map;
}

/**
 * Price-implied winner for a crypto pool right now: UP if the latest spot tick is
 * above the strike, else DOWN (tie → DOWN, mirroring the resolver). Null when we
 * have no buffered price for the asset (can't tell → don't place a closing bet).
 * Strike and ticks are both micro-USD, matching the resolver's comparison.
 */
function priceWinnerSide(asset: string, strike: bigint): Side | null {
  const tick = getPriceAtOrBefore(asset, Date.now());
  if (!tick) return null;
  const micro = BigInt(Math.round(parseFloat(tick.price) * 1_000_000));
  return micro > strike ? 'UP' : 'DOWN';
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

  const now = Date.now();
  // Include pools right up to the tx-safety margin so the closing play can fire;
  // classification below splits them into closing vs steady-liquidity phases.
  const safetyCutoff = new Date(now + cfg.closingSafetySeconds * 1000);
  const pools = await prisma.pool.findMany({
    where: {
      poolType: 'CRYPTO', interval: EVENT_INTERVAL, asset: { in: EVENT_ASSETS }, squadId: null,
      status: { in: ['JOINING', 'ACTIVE'] }, lockTime: { gt: safetyCutoff },
    },
    select: { id: true, asset: true, strikePrice: true, startTime: true, lockTime: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  // Skip orphan pools: a DB row can exist without the on-chain pool PDA ever being
  // initialized (creation rollback / RPC hiccup). Depositing to those fails with
  // AccountNotInitialized (0xbc4), so filter them out in one batched RPC call.
  const conn = getConnection();
  const poolPdas = pools.map((p) => getPoolPDA(derivePoolSeed(p.id))[0]);
  const infos = poolPdas.length > 0 ? await conn.getMultipleAccountsInfo(poolPdas) : [];
  const livePools = pools.filter((_, i) => infos[i] != null);
  const orphans = pools.length - livePools.length;
  if (orphans > 0) console.warn(`[EventBot] skipped ${orphans} orphan pool(s) not initialized on-chain`);
  diag.poolsConsidered = livePools.length;
  if (livePools.length === 0) {
    diag.reason = pools.length > 0 ? `all ${pools.length} open pools are orphans (not on-chain)` : 'no open CRYPTO 5m pools';
    return { placed: 0, spent: 0n };
  }

  let cycleSpent = 0n;
  let placed = 0;

  // Shared placement: fund + deposit + record + update running totals. Returns
  // the amount actually placed (0n on failure), so callers keep pool-local tallies.
  const place = async (pool: { id: string; startTime: Date; lockTime: Date }, wallet: Keypair, side: Side, amount: bigint, tag?: string): Promise<bigint> => {
    if (amount <= 0n) return 0n;
    try {
      await fundBotWallet(wallet.publicKey, cfg.walletUsdcTopup, cfg.walletSolTopup);
      const sig = await placeBotDeposit(pool, wallet, side, amount);
      await recordConfirmedBet({ pool, walletAddress: wallet.publicKey.toBase58(), side, betAmount: amount, txSignature: sig });
      cycleSpent += amount; exposure += amount; placed++;
      console.log(`[EventBot] +${Number(amount) / 1e6} USDC ${side} pool=${pool.id.slice(0, 8)}${tag ? ` (${tag})` : ''}`);
      return amount;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      diag.lastError = `deposit pool=${pool.id.slice(0, 8)}: ${msg}`.slice(0, 300);
      diag.lastErrorAt = new Date().toISOString();
      console.warn(`[EventBot] deposit failed pool=${pool.id.slice(0, 8)}:`, msg);
      return 0n;
    }
  };

  // Closing pools have their lock imminent (within the closing window); the rest
  // get steady, balanced liquidity.
  const closingPools = livePools.filter((p) => p.lockTime.getTime() - now <= cfg.closingWindowSeconds * 1000);
  const normalPools = livePools.filter((p) => p.lockTime.getTime() - now > cfg.closingWindowSeconds * 1000);

  // PASS A — closing play: seconds before lock, pile the price-implied winning
  // side to blunt a lone user who waits and bets big at the end. Only the winning
  // side's assigned bots add, so bots never end up hedged (which bleeds fees).
  if (cfg.closingBetEnabled) {
    for (const pool of closingPools) {
      if (cycleSpent >= cfg.perCycleCap || exposure >= cfg.maxTotalExposure) break;
      if (pool.strikePrice == null) continue;
      const winner = priceWinnerSide(pool.asset, pool.strikePrice);
      if (!winner) continue;
      const loser: Side = winner === 'UP' ? 'DOWN' : 'UP';
      const sideOf = assignSides(pool.id, wallets);

      const poolBets = await prisma.bet.findMany({ where: { poolId: pool.id, walletAddress: { in: botAddrs } }, select: { amount: true, side: true, walletAddress: true } });
      let winnerStake = poolBets.filter((b) => b.side === winner).reduce((s, b) => s + b.amount, 0n);
      if (winnerStake >= cfg.closingPerPoolCap) continue;
      const onLoser = new Set(poolBets.filter((b) => b.side === loser).map((b) => b.walletAddress));

      // Eligible = bots assigned to the winning side that never touched the loser
      // side here (a mid-window price flip could otherwise make them hedgers).
      const eligible = wallets
        .filter((w) => { const a = w.publicKey.toBase58(); return sideOf.get(a) === winner && !onLoser.has(a); })
        .sort(() => Math.random() - 0.5);

      for (const wallet of eligible) {
        if (winnerStake >= cfg.closingPerPoolCap || cycleSpent >= cfg.perCycleCap || exposure >= cfg.maxTotalExposure) break;
        // Bail if lock crept too close while we worked this pool (tx would miss it).
        if (pool.lockTime.getTime() - Date.now() < cfg.closingSafetySeconds * 1000) break;
        const amount = minBig(randBigInt(cfg.closingBetMin, cfg.closingBetMax), cfg.closingPerPoolCap - winnerStake, cfg.perCycleCap - cycleSpent, cfg.maxTotalExposure - exposure);
        winnerStake += await place(pool, wallet, winner, amount, 'closing');
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // PASS B — steady liquidity: each bot fixed to ONE side for the pool (3 UP /
  // 3 DOWN), topped up toward a balanced per-side target. No hedging.
  for (const pool of normalPools) {
    if (cycleSpent >= cfg.perCycleCap || exposure >= cfg.maxTotalExposure) break;
    const sideOf = assignSides(pool.id, wallets);

    const poolBets = await prisma.bet.findMany({ where: { poolId: pool.id, walletAddress: { in: botAddrs } }, select: { amount: true, side: true, walletAddress: true } });
    let poolStake = poolBets.reduce((s, b) => s + b.amount, 0n);
    const effCap = poolTarget(pool.id, cfg.perPoolCap, cfg.betMin, cfg.perPoolVariancePct);
    if (poolStake >= effCap) continue;

    const sides: Side[] = ['UP', 'DOWN'];
    const perSideTarget = effCap / 2n;
    const stakeBySide = new Map<Side, bigint>(sides.map((s) => [s, 0n]));
    const betBySideWallet = new Map<Side, Set<string>>(sides.map((s) => [s, new Set<string>()]));
    for (const b of poolBets) {
      if (b.side !== 'UP' && b.side !== 'DOWN') continue;
      stakeBySide.set(b.side, (stakeBySide.get(b.side) ?? 0n) + b.amount);
      betBySideWallet.get(b.side)?.add(b.walletAddress);
    }

    for (const side of sides) {
      if (cycleSpent >= cfg.perCycleCap || exposure >= cfg.maxTotalExposure || poolStake >= effCap) break;
      let sideStake = stakeBySide.get(side) ?? 0n;
      if (sideStake >= perSideTarget) continue;

      const alreadyBet = betBySideWallet.get(side) ?? new Set<string>();
      // Only bots ASSIGNED to this side, not already on it (one bet per bot/side).
      const eligible = wallets.filter((w) => { const a = w.publicKey.toBase58(); return sideOf.get(a) === side && !alreadyBet.has(a); });
      if (eligible.length === 0) continue;
      const wallet = eligible[Math.floor(Math.random() * eligible.length)];

      const amount = minBig(randBigInt(cfg.betMin, cfg.betMax), perSideTarget - sideStake, effCap - poolStake, cfg.perCycleCap - cycleSpent, cfg.maxTotalExposure - exposure);
      const done = await place(pool, wallet, side, amount);
      if (done > 0n) { poolStake += done; sideStake += done; stakeBySide.set(side, sideStake); alreadyBet.add(wallet.publicKey.toBase58()); }
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
