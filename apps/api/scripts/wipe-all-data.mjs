// FULL data wipe for a clean-slate re-test. Deletes every DATA table in
// FK-safe (child-first) order, KEEPING the admin config tables.
// Run AFTER stopping the API (so schedulers don't recreate rows mid-wipe):
//   node scripts/wipe-all-data.mjs
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const host = (process.env.DATABASE_URL || '').replace(/:\/\/[^:]+:[^@]+@/, '://***@');

// KEEP (admin config): poolCategory, poolCreationConfig, liquidityBotConfig,
// emissionConfig, milestone.
const ORDER = [
  'bet', 'tradeFill', 'exchangeConnection', 'walletLink',
  'referralEarning', 'referralPayout', 'referral',
  'squadMessage', 'squadMember', 'squad',
  'tournamentRoundFixture', 'tournamentMatch', 'tournamentParticipant', 'tournament',
  'notification', 'rewardLog', 'rewardGrant', 'resolutionSuggestion',
  'priceTick', 'priceSnapshot',
  'sportsFixtureCache', 'fighterImageCache', 'liveScore',
  'eventLog', 'uptimeCheck',
  'pool', 'user',
];
const KEPT = ['poolCategory', 'poolCreationConfig', 'liquidityBotConfig', 'emissionConfig', 'milestone'];

console.log(`[${host}] WIPE — keeping config: ${KEPT.join(', ')}`);
for (const m of ORDER) {
  if (!p[m]) { console.log(`  ! skip ${m} (no such model)`); continue; }
  const r = await p[m].deleteMany({});
  console.log(`  - ${m}: ${r.count}`);
}
console.log('--- kept (config) ---');
for (const m of KEPT) {
  if (p[m]) console.log(`  KEPT ${m}: ${await p[m].count()}`);
}
await p.$disconnect();
console.log('done.');
