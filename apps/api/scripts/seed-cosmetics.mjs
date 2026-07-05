import { PrismaClient } from '@prisma/client';

/**
 * Seed the cosmetics catalog (UP-Coin sink). Prices are in stored units
 * (display = /100). Idempotent via unique `sku` (upsert). Tune freely.
 *
 * Usage (from apps/api):  node scripts/seed-cosmetics.mjs
 */
const prisma = new PrismaClient();

// price: stored units. 5_000 = 50 UP displayed.
const CATALOG = [
  // TITLE — a display title shown next to the name.
  { sku: 'title-degen', kind: 'TITLE', name: 'Degen', price: 5_000n, value: 'Degen', sortOrder: 10 },
  { sku: 'title-oracle', kind: 'TITLE', name: 'Oracle', price: 15_000n, value: 'Oracle', sortOrder: 11 },
  { sku: 'title-whale', kind: 'TITLE', name: 'Whale', price: 40_000n, value: 'Whale', sortOrder: 12 },
  // NAME_COLOR — hex color applied to the display name.
  { sku: 'color-cyan', kind: 'NAME_COLOR', name: 'Cyan Name', price: 8_000n, value: '#22D3EE', sortOrder: 20 },
  { sku: 'color-gold', kind: 'NAME_COLOR', name: 'Gold Name', price: 20_000n, value: '#F5B301', sortOrder: 21 },
  { sku: 'color-magenta', kind: 'NAME_COLOR', name: 'Magenta Name', price: 20_000n, value: '#E14EFF', sortOrder: 22 },
  // BADGE — an emoji/icon shown on the profile.
  { sku: 'badge-rocket', kind: 'BADGE', name: 'Rocket Badge', price: 6_000n, value: '🚀', sortOrder: 30 },
  { sku: 'badge-crown', kind: 'BADGE', name: 'Crown Badge', price: 25_000n, value: '👑', sortOrder: 31 },
  // FRAME — hex color for an avatar ring.
  { sku: 'frame-cyan', kind: 'FRAME', name: 'Cyan Frame', price: 12_000n, value: '#22D3EE', sortOrder: 40 },
  { sku: 'frame-gold', kind: 'FRAME', name: 'Gold Frame', price: 30_000n, value: '#F5B301', sortOrder: 41 },
];

let created = 0;
for (const c of CATALOG) {
  await prisma.cosmetic.upsert({
    where: { sku: c.sku },
    update: { kind: c.kind, name: c.name, price: c.price, value: c.value, sortOrder: c.sortOrder, active: true },
    create: c,
  });
  created++;
}
const rows = await prisma.cosmetic.findMany({ orderBy: { sortOrder: 'asc' }, select: { sku: true, kind: true, price: true } });
console.log(JSON.stringify({ env: process.env.ENV_LABEL ?? '?', upserted: created, rows: rows.map(r => ({ ...r, price: r.price.toString() })) }, null, 2));
await prisma.$disconnect();
