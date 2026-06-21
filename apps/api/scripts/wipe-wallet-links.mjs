// Wipe ALL wallet links + exchange connections for the DB in DATABASE_URL.
// Use to get a clean slate when re-testing terminal identity/agent wiring.
//   local: node scripts/wipe-wallet-links.mjs
//   prod:  railway run --service api node scripts/wipe-wallet-links.mjs
//   or:    DATABASE_URL="postgres://..." node scripts/wipe-wallet-links.mjs
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const host = (process.env.DATABASE_URL || '').replace(/:\/\/[^:]+:[^@]+@/, '://***@');

const ec = await p.exchangeConnection.deleteMany({});
const wl = await p.walletLink.deleteMany({});
console.log(`[${host}] wiped → exchange_connections: ${ec.count} | wallet_links: ${wl.count}`);

await p.$disconnect();
