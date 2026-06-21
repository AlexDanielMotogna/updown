/**
 * Trading-XP service — credits HyperLiquid trading volume into the user's unified
 * XP + UP coins (docs/PLAN-TRADING-XP.md). Reads `userFills`, persists new fills,
 * and awards fee-weighted XP + volume-based coins.
 *
 * Two entry points share `creditConnectionFills`:
 *  - `startTradingXpPoller()` — background safety net (gated by TRADING_XP=on).
 *  - `creditConnectionFills(accountAddress)` — on-demand, called by the
 *    POST /api/exchange/credit-fills endpoint when the terminal sees a fill.
 *
 * Mainnet only.
 */
import { InfoClient, MAINNET } from 'exchange-hyperliquid';
import { prisma } from '../../db';
import { awardTradeFills, type AwardTradeFillsResult, type TradeFillInput } from '../rewards';

const ENABLED = process.env.TRADING_XP === 'on';
const INTERVAL_MS = Math.max(30, Number(process.env.TRADING_XP_INTERVAL_SECONDS) || 120) * 1000;
const THROTTLE_MS = 400; // between accounts, RPC-friendly

let running = false;
let timer: NodeJS.Timeout | null = null;
const sharedInfo = new InfoClient(MAINNET);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface HlFill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  fee: string;
  closedPnl?: string;
  tid: number;
  dir?: string;
}

interface ConnRow {
  accountAddress: string;
  lastFillTime: bigint | null;
  walletAddress: string;
}

const EMPTY: AwardTradeFillsResult = { newFills: 0, xpAwarded: 0n, coinsAwarded: 0n, newLevel: 0, levelUp: false };

/** Core: read an account's fills since its cursor, credit XP+coins, advance cursor. */
async function creditFromConn(conn: ConnRow, info: InfoClient): Promise<AwardTradeFillsResult> {
  const since = conn.lastFillTime ?? 0n;
  const raw = (await info.userFills(conn.accountAddress)) as unknown as HlFill[];
  if (!Array.isArray(raw) || raw.length === 0) return EMPTY;

  const fresh = raw.filter((f) => BigInt(Math.round(f.time)) > since);
  let result = EMPTY;
  if (fresh.length > 0) {
    const fills: TradeFillInput[] = fresh.map((f) => {
      const notionalUsd = Math.abs(Number(f.px) * Number(f.sz));
      return {
        tid: BigInt(f.tid),
        coin: f.coin,
        side: f.side === 'B' ? 'BUY' : 'SELL',
        px: f.px,
        sz: f.sz,
        feeUsd: Number(f.fee),
        notionalUsd,
        pnlUsd: f.closedPnl != null ? Number(f.closedPnl) : null,
        dir: f.dir ?? null,
        time: f.time,
      };
    });
    result = await awardTradeFills(conn.walletAddress, conn.accountAddress, fills);
  }

  // Advance the cursor to the newest fill seen (even if all were dupes) so we
  // don't re-scan the same window forever.
  const maxTime = raw.reduce((m, f) => Math.max(m, f.time), Number(since));
  if (BigInt(Math.round(maxTime)) > since) {
    await prisma.exchangeConnection.updateMany({
      where: { accountAddress: conn.accountAddress, exchange: 'hyperliquid', isTestnet: false },
      data: { lastFillTime: BigInt(Math.round(maxTime)) },
    });
  }

  if (result.newFills > 0) {
    console.log(`[TradingXP] ${conn.walletAddress.slice(0, 8)}… +${result.xpAwarded} XP / +${result.coinsAwarded} coins from ${result.newFills} fills`);
  }
  return result;
}

/** On-demand credit for one account (the terminal's near-instant ping). Mainnet. */
export async function creditConnectionFills(accountAddress: string): Promise<AwardTradeFillsResult> {
  const conn = await prisma.exchangeConnection.findFirst({
    where: { accountAddress: accountAddress.toLowerCase(), exchange: 'hyperliquid', isTestnet: false, active: true },
    select: { accountAddress: true, lastFillTime: true, user: { select: { walletAddress: true } } },
  });
  if (!conn) return EMPTY;
  return creditFromConn({ accountAddress: conn.accountAddress, lastFillTime: conn.lastFillTime, walletAddress: conn.user.walletAddress }, sharedInfo);
}

async function runCycle(): Promise<void> {
  const conns = await prisma.exchangeConnection.findMany({
    where: { exchange: 'hyperliquid', isTestnet: false, active: true },
    select: { accountAddress: true, lastFillTime: true, user: { select: { walletAddress: true } } },
  });
  for (const c of conns) {
    try {
      await creditFromConn({ accountAddress: c.accountAddress, lastFillTime: c.lastFillTime, walletAddress: c.user.walletAddress }, sharedInfo);
    } catch (e) {
      console.error(`[TradingXP] ${c.accountAddress.slice(0, 8)}… cycle error:`, e instanceof Error ? e.message : e);
    }
    await sleep(THROTTLE_MS);
  }
}

export function startTradingXpPoller(): void {
  if (!ENABLED) {
    console.log('[TradingXP] poller disabled (set TRADING_XP=on to enable)');
    return;
  }
  const loop = async () => {
    if (!running) {
      running = true;
      try { await runCycle(); } catch (e) {
        console.error('[TradingXP] loop error:', e instanceof Error ? e.message : e);
      } finally { running = false; }
    }
    timer = setTimeout(loop, INTERVAL_MS);
  };
  console.log(`[TradingXP] poller started (every ${INTERVAL_MS / 1000}s, mainnet)`);
  timer = setTimeout(loop, 10_000);
}
