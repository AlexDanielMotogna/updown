import type { BoostKind } from '@prisma/client';
import { prisma } from '../db';
import { spendCoins } from './coin-spend';

/**
 * Boosts sink (docs/PLAN-UP-UTILITY-IMPL.md §3, Sink 3).
 *
 * A boost is a time-limited XP or COINS multiplier bought with UP Coins (burned).
 * Applied at the award site (awardBetWin / awardTradeFills) ON TOP of the level
 * multiplier. Capped to keep progression meaningful: max 2.0x, short durations, and
 * only one active per kind at a time (buying while active is rejected — that gate
 * doubles as the cooldown). Boosted coin emission STILL passes through the
 * EmissionConfig budget, so a boost can never exceed the global cap.
 */

export interface BoostProduct {
  sku: string;
  kind: BoostKind;
  /** basis points, 20000 = 2.0x. Capped at 2x. */
  multiplierBps: number;
  durationHours: number;
  /** price in stored UP-coin units (display = /100). */
  price: bigint;
  label: string;
}

// Hardcoded catalog (small + rarely changes). Prices in stored units.
export const BOOST_PRODUCTS: BoostProduct[] = [
  { sku: 'coins-2x-1h', kind: 'COINS', multiplierBps: 20000, durationHours: 1, price: 3_000n, label: '2x Coins · 1h' },
  { sku: 'coins-2x-24h', kind: 'COINS', multiplierBps: 20000, durationHours: 24, price: 40_000n, label: '2x Coins · 24h' },
  { sku: 'xp-2x-1h', kind: 'XP', multiplierBps: 20000, durationHours: 1, price: 3_000n, label: '2x XP · 1h' },
  { sku: 'xp-2x-24h', kind: 'XP', multiplierBps: 20000, durationHours: 24, price: 40_000n, label: '2x XP · 24h' },
];

const NO_BOOST_BPS = 10_000;

/** Multiply a base amount by a boost's basis points (10000 = 1.0x → unchanged). */
export function applyBoost(amount: bigint, bps: number): bigint {
  if (bps <= NO_BOOST_BPS) return amount;
  return (amount * BigInt(bps)) / BigInt(NO_BOOST_BPS);
}

/**
 * Current XP/COINS multipliers for a wallet from its non-expired boosts. Returns
 * basis points (10000 = no boost). Called at every coin/XP award.
 */
export async function getBoostMultipliers(wallet: string): Promise<{ xpBps: number; coinsBps: number }> {
  const rows = await prisma.activeBoost.findMany({
    where: { walletAddress: wallet, expiresAt: { gt: new Date() } },
  });
  let xpBps = NO_BOOST_BPS;
  let coinsBps = NO_BOOST_BPS;
  for (const r of rows) {
    if (r.kind === 'XP') xpBps = Math.max(xpBps, r.multiplierBps);
    else if (r.kind === 'COINS') coinsBps = Math.max(coinsBps, r.multiplierBps);
  }
  return { xpBps, coinsBps };
}

export interface ActiveBoostView {
  kind: BoostKind;
  sku: string;
  multiplierBps: number;
  expiresAt: string;
}

export interface BoostState {
  products: Array<{ sku: string; kind: BoostKind; multiplierBps: number; durationHours: number; price: string; label: string }>;
  active: ActiveBoostView[];
}

/** Store state: the catalog plus this wallet's currently-active boosts. */
export async function getBoostState(wallet?: string): Promise<BoostState> {
  const products = BOOST_PRODUCTS.map((p) => ({
    sku: p.sku, kind: p.kind, multiplierBps: p.multiplierBps, durationHours: p.durationHours,
    price: p.price.toString(), label: p.label,
  }));
  if (!wallet) return { products, active: [] };
  const rows = await prisma.activeBoost.findMany({
    where: { walletAddress: wallet, expiresAt: { gt: new Date() } },
  });
  return {
    products,
    active: rows.map((r) => ({ kind: r.kind, sku: r.sku, multiplierBps: r.multiplierBps, expiresAt: r.expiresAt.toISOString() })),
  };
}

export type BuyBoostResult =
  | { ok: true; balance: bigint; kind: BoostKind; expiresAt: string }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_ACTIVE' | 'INSUFFICIENT_FUNDS' | 'DUPLICATE' };

/** Buy a boost by sku. Burns coins and activates the multiplier atomically. */
export async function buyBoost(wallet: string, sku: string, idempotencyKey?: string): Promise<BuyBoostResult> {
  const product = BOOST_PRODUCTS.find((p) => p.sku === sku);
  if (!product) return { ok: false, reason: 'NOT_FOUND' };

  const now = new Date();
  const existing = await prisma.activeBoost.findUnique({
    where: { walletAddress_kind: { walletAddress: wallet, kind: product.kind } },
  });
  if (existing && existing.expiresAt > now) return { ok: false, reason: 'ALREADY_ACTIVE' };

  const expiresAt = new Date(now.getTime() + product.durationHours * 3_600_000);

  const result = await spendCoins({
    walletAddress: wallet,
    amount: product.price,
    type: 'BOOST',
    sku,
    burned: true,
    idempotencyKey,
    metadata: { kind: product.kind, multiplierBps: product.multiplierBps, durationHours: product.durationHours },
    applyInTx: async (tx) => {
      // Unique (wallet, kind) → upsert replaces an expired boost of the same kind.
      await tx.activeBoost.upsert({
        where: { walletAddress_kind: { walletAddress: wallet, kind: product.kind } },
        create: { walletAddress: wallet, kind: product.kind, sku, multiplierBps: product.multiplierBps, expiresAt },
        update: { sku, multiplierBps: product.multiplierBps, expiresAt },
      });
    },
  });

  if (!result.ok) return result;
  return { ok: true, balance: result.balance, kind: product.kind, expiresAt: expiresAt.toISOString() };
}
