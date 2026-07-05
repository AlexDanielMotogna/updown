import type { CosmeticKind } from '@prisma/client';
import { prisma } from '../db';
import { spendCoins } from './coin-spend';

/**
 * Cosmetics sink (docs/PLAN-UP-UTILITY-IMPL.md §3, Sink 2).
 *
 * Buying a cosmetic BURNS UP Coins (hard sink) and grants ownership. Cosmetics are
 * pure status — no economic effect — so they're the safest sink (no pay-to-win in
 * shared pools). Equipping is limited to one item per kind (BADGE / FRAME / TITLE /
 * NAME_COLOR); the render `value` is interpreted per kind by the UI.
 */

export interface CatalogEntry {
  id: string;
  sku: string;
  kind: CosmeticKind;
  name: string;
  price: string; // stored units
  value: string;
  owned: boolean;
  equipped: boolean;
}

/** The store: every active cosmetic plus this wallet's owned/equipped flags. */
export async function getCosmeticCatalog(wallet?: string): Promise<CatalogEntry[]> {
  const [cosmetics, owned] = await Promise.all([
    prisma.cosmetic.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    }),
    wallet ? prisma.userCosmetic.findMany({ where: { walletAddress: wallet } }) : Promise.resolve([]),
  ]);
  const ownedMap = new Map(owned.map((o) => [o.cosmeticId, o]));
  return cosmetics.map((c) => ({
    id: c.id,
    sku: c.sku,
    kind: c.kind,
    name: c.name,
    price: c.price.toString(),
    value: c.value,
    owned: ownedMap.has(c.id),
    equipped: ownedMap.get(c.id)?.equipped ?? false,
  }));
}

export interface EquippedCosmetic {
  sku: string;
  kind: CosmeticKind;
  name: string;
  value: string;
}

/** The wallet's currently-equipped cosmetics (at most one per kind). */
export async function getEquippedCosmetics(wallet: string): Promise<EquippedCosmetic[]> {
  const rows = await prisma.userCosmetic.findMany({
    where: { walletAddress: wallet, equipped: true },
    include: { cosmetic: true },
  });
  return rows.map((r) => ({
    sku: r.cosmetic.sku,
    kind: r.kind,
    name: r.cosmetic.name,
    value: r.cosmetic.value,
  }));
}

export type BuyCosmeticResult =
  | { ok: true; balance: bigint; cosmeticId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_OWNED' | 'INSUFFICIENT_FUNDS' | 'DUPLICATE' };

/** Buy a cosmetic by sku. Burns coins and grants ownership atomically. */
export async function buyCosmetic(
  wallet: string,
  sku: string,
  idempotencyKey?: string,
): Promise<BuyCosmeticResult> {
  const cosmetic = await prisma.cosmetic.findFirst({ where: { sku, active: true } });
  if (!cosmetic) return { ok: false, reason: 'NOT_FOUND' };

  const already = await prisma.userCosmetic.findUnique({
    where: { walletAddress_cosmeticId: { walletAddress: wallet, cosmeticId: cosmetic.id } },
    select: { id: true },
  });
  if (already) return { ok: false, reason: 'ALREADY_OWNED' };

  const result = await spendCoins({
    walletAddress: wallet,
    amount: cosmetic.price,
    type: 'COSMETIC',
    sku,
    burned: true,
    idempotencyKey,
    metadata: { cosmeticId: cosmetic.id, kind: cosmetic.kind },
    applyInTx: async (tx) => {
      // Unique (wallet, cosmeticId) guards a concurrent double-buy: the loser's
      // create throws P2002, rolling back the debit (coins refunded). spendCoins
      // surfaces that as DUPLICATE.
      await tx.userCosmetic.create({
        data: { walletAddress: wallet, cosmeticId: cosmetic.id, kind: cosmetic.kind },
      });
    },
  });

  if (!result.ok) return result;
  return { ok: true, balance: result.balance, cosmeticId: cosmetic.id };
}

export type EquipResult = { ok: true } | { ok: false; reason: 'NOT_OWNED' };

/**
 * Equip or unequip an owned cosmetic. Equipping first unequips any other owned
 * cosmetic of the same kind (one active per kind), atomically.
 */
export async function equipCosmetic(
  wallet: string,
  cosmeticId: string,
  equipped: boolean,
): Promise<EquipResult> {
  const owned = await prisma.userCosmetic.findUnique({
    where: { walletAddress_cosmeticId: { walletAddress: wallet, cosmeticId } },
  });
  if (!owned) return { ok: false, reason: 'NOT_OWNED' };

  await prisma.$transaction(async (tx) => {
    if (equipped) {
      await tx.userCosmetic.updateMany({
        where: { walletAddress: wallet, kind: owned.kind, equipped: true },
        data: { equipped: false },
      });
    }
    await tx.userCosmetic.update({ where: { id: owned.id }, data: { equipped } });
  });
  return { ok: true };
}
