/**
 * Repair the crypto pools that were settled against a frozen price tick.
 *
 * Background: the Pacifica price WebSocket died on 2026-08-23 08:17:13 UTC and the
 * resolver kept reading the last tick in the buffer, so every pool that ended after
 * that point was settled with a price hours old. The market had moved up, so nearly
 * all of them resolved DOWN and every UP bettor lost against a fossil.
 *
 * On-chain payouts already went out and cannot be clawed back, so this repairs the
 * two things that still matter:
 *
 *   --neutralize   DB accounting: stamp payout_amount = amount on every bet in the
 *                  window so realized PNL for those pools is exactly 0 for BOTH
 *                  sides. This is what the weekly leaderboard reads
 *                  (routes/crypto-predictions.ts cryptoProfitMap = Σ payout − stake),
 *                  and the weekly prize is real cash, so the board must not keep the
 *                  result of a broken oracle. Writes an EventLog row per pool.
 *
 *   --compensate   On-chain: mint back to each REAL user (bots excluded) whatever
 *                  they are still down on those pools, i.e. Σ max(stake − payout, 0).
 *                  Test USDC, minted by the authority, same as the faucet.
 *
 * Both are independent; run either or both. Default is a dry run that changes nothing.
 *
 * Usage (from apps/api):
 *   node -r dotenv/config scripts/repair-frozen-price-pools.mjs
 *   node -r dotenv/config scripts/repair-frozen-price-pools.mjs --neutralize
 *   node -r dotenv/config scripts/repair-frozen-price-pools.mjs --compensate
 *   node -r dotenv/config scripts/repair-frozen-price-pools.mjs --neutralize --compensate --apply
 *
 * Options:
 *   --since=<ISO>   window start, default 2026-08-23T08:17:14Z (last live tick)
 *   --until=<ISO>   window end, default now
 *   --env=prod|dev|local   which database, default prod
 *   --apply         actually write. Without it, nothing is written or minted.
 *
 * Needs AUTHORITY_SECRET_KEY of the target environment for --compensate (it must be
 * the mint authority of USDC_MINT). The script prints both before doing anything.
 */
import { PrismaClient } from '@prisma/client';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, getMint } from '@solana/spl-token';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const has = (flag) => process.argv.includes(`--${flag}`);

const APPLY = has('apply');
const NEUTRALIZE = has('neutralize');
const COMPENSATE = has('compensate');
const SINCE = new Date(arg('since', '2026-08-23T08:17:14Z'));
const UNTIL = new Date(arg('until', new Date().toISOString()));
const ENV = arg('env', 'prod');

const DB_URL = ENV === 'dev' ? process.env.DEV_DIRECT_URL : ENV === 'local' ? process.env.DIRECT_URL : process.env.PROD_DIRECT_URL;
if (!DB_URL) { console.error(`No database URL for --env=${ENV}`); process.exit(1); }
if (!NEUTRALIZE && !COMPENSATE) console.log('No action flag given (--neutralize / --compensate): report only.\n');

const prisma = new PrismaClient({ datasourceUrl: DB_URL });
const mask = (w) => `${w.slice(0, 4)}..${w.slice(-4)}`;
const usd = (raw) => (Number(raw) / 1e6).toFixed(2);

console.log(`env=${ENV}  window=${SINCE.toISOString()} → ${UNTIL.toISOString()}`);
console.log(APPLY ? 'MODE: APPLY\n' : 'MODE: dry run (add --apply to write)\n');

// ── 1. The affected pools ────────────────────────────────────────────────────
const pools = await prisma.pool.findMany({
  where: { poolType: 'CRYPTO', endTime: { gt: SINCE, lte: UNTIL }, winner: { not: null } },
  select: { id: true, asset: true, endTime: true, strikePrice: true, finalPrice: true, winner: true },
});
if (pools.length === 0) { console.log('No pools in that window.'); await prisma.$disconnect(); process.exit(0); }

// Sanity check the operator can eyeball: in a frozen window every pool of an asset
// carries the SAME final price. If these are many, the window is probably wrong.
const byAsset = new Map();
for (const p of pools) {
  const e = byAsset.get(p.asset) ?? { pools: 0, finals: new Set(), winners: new Map() };
  e.pools++;
  e.finals.add(p.finalPrice?.toString() ?? 'null');
  e.winners.set(p.winner, (e.winners.get(p.winner) ?? 0) + 1);
  byAsset.set(p.asset, e);
}
console.log('== pools in window ==');
console.table([...byAsset.entries()].map(([asset, e]) => ({
  asset, pools: e.pools, 'distinct finals': e.finals.size,
  finals: [...e.finals].slice(0, 3).map((f) => (f === 'null' ? f : usd(f))).join(', '),
  winners: [...e.winners.entries()].map(([w, n]) => `${w}:${n}`).join(' '),
})));
for (const [asset, e] of byAsset) {
  if (e.finals.size > 1) console.warn(`  ! ${asset} has ${e.finals.size} distinct final prices in this window — double-check --since/--until before applying.`);
}

// ── 2. The bets in those pools ───────────────────────────────────────────────
const poolIds = pools.map((p) => p.id);
const bets = await prisma.bet.findMany({
  where: { poolId: { in: poolIds } },
  select: { id: true, poolId: true, walletAddress: true, side: true, amount: true, payoutAmount: true },
});

// Bot wallets are liquidity, not players: never compensated, but their accounting is
// neutralized too so they can't keep a leaderboard gain from a broken oracle.
const botAddrs = new Set();
for (const envKey of ['EVENT_BOT_KEYS', 'LIQUIDITY_BOT_KEYS']) {
  const raw = process.env[envKey];
  if (!raw) continue;
  try {
    for (const sk of JSON.parse(raw)) botAddrs.add(Keypair.fromSecretKey(Uint8Array.from(sk)).publicKey.toBase58());
  } catch { console.warn(`  ! ${envKey} is set but unparseable — bot wallets from it will be treated as users`); }
}

const shortfall = new Map(); // wallet -> lamports of USDC still owed
let staked = 0n, paid = 0n;
for (const b of bets) {
  const payout = b.payoutAmount ?? 0n;
  staked += b.amount;
  paid += payout;
  const owed = b.amount > payout ? b.amount - payout : 0n;
  if (owed > 0n) shortfall.set(b.walletAddress, (shortfall.get(b.walletAddress) ?? 0n) + owed);
}

// Who counts as a real player. Env bot keys are the first filter, but they are only
// as good as the env this script happens to run with (EVENT_BOT_KEYS lives on the API
// host, not necessarily here), and paying a bot 16k of test USDC by accident is a
// silent way to corrupt the very numbers we are repairing. So require positive proof
// of a human instead: an event participant is a user row that signed up through the
// event (signup IP recorded) or was auto-funded. Bots have neither — they were never
// created through /join. Same definition as routes/admin/crypto.ts eventUsers().
const participantRows = await prisma.user.findMany({
  where: {
    walletAddress: { in: [...shortfall.keys()] },
    OR: [{ signupIp: { not: null } }, { autoFundedAt: { not: null } }],
  },
  select: { walletAddress: true },
});
const participants = new Set(participantRows.map((u) => u.walletAddress));

const skipped = [];
const userShortfall = [];
for (const [w, v] of shortfall) {
  const why = botAddrs.has(w) ? 'bot wallet (env keys)' : !participants.has(w) ? 'not an event participant' : null;
  if (why) skipped.push({ wallet: mask(w), owed: usd(v), reason: why });
  else userShortfall.push([w, v]);
}
userShortfall.sort((a, b) => (b[1] > a[1] ? 1 : -1));
const owedTotal = userShortfall.reduce((acc, [, v]) => acc + v, 0n);

console.log(`\n== bets ==\n${bets.length} bets, ${new Set(bets.map((b) => b.walletAddress)).size} wallets, staked ${usd(staked)} USDC, paid ${usd(paid)} USDC`);
console.log(`bot wallets known from env: ${botAddrs.size}${botAddrs.size === 0 ? ' (set EVENT_BOT_KEYS/LIQUIDITY_BOT_KEYS or bots get compensated as users)' : ''}`);
console.log(`\n== users still down (compensation targets) ==  ${userShortfall.length} wallets, ${usd(owedTotal)} USDC`);
console.table(userShortfall.slice(0, 25).map(([w, v]) => ({ wallet: mask(w), owed: usd(v) })));
if (userShortfall.length > 25) console.log(`  … ${userShortfall.length - 25} more`);

if (skipped.length) {
  console.log(`\n== skipped (not compensated) ==  ${skipped.length} wallets`);
  console.table(skipped);
}

// Warn if a weekly prize was already drawn off these numbers.
const weekWinners = await prisma.cryptoEventWinner.findMany({
  where: { weekStart: { gte: new Date(SINCE.getTime() - 7 * 86_400_000) } },
  select: { weekStart: true, rank: true, walletAddress: true, prize: true, paid: true },
});
if (weekWinners.length) {
  console.log('\n== weekly winners already recorded for this period ==');
  console.table(weekWinners.map((w) => ({ week: w.weekStart.toISOString().slice(0, 10), rank: w.rank, wallet: mask(w.walletAddress), prize: w.prize, paid: w.paid })));
  console.log('  ! Re-draw the week after neutralizing (unpaid rows are overwritten by drawCryptoWeek; PAID rows are never touched).');
}

if (!APPLY) { console.log('\nDry run: nothing written.'); await prisma.$disconnect(); process.exit(0); }

// ── 3. Neutralize the leaderboard accounting ─────────────────────────────────
if (NEUTRALIZE) {
  console.log('\n== neutralizing ==');
  let updated = 0;
  for (const b of bets) {
    if ((b.payoutAmount ?? 0n) === b.amount) continue; // already neutral
    await prisma.bet.update({ where: { id: b.id }, data: { payoutAmount: b.amount } });
    updated++;
  }
  for (const p of pools) {
    await prisma.eventLog.create({
      data: {
        eventType: 'POOL_PRICE_VOIDED', entityType: 'pool', entityId: p.id,
        payload: {
          reason: 'frozen_price_feed', asset: p.asset,
          endTime: p.endTime.toISOString(),
          strikePrice: p.strikePrice?.toString() ?? null,
          finalPrice: p.finalPrice?.toString() ?? null,
          winner: p.winner,
        },
      },
    }).catch(() => {});
  }
  console.log(`  ${updated} bets stamped payout = stake, ${pools.length} pools logged as POOL_PRICE_VOIDED`);
}

// ── 4. Compensate real users on-chain ────────────────────────────────────────
if (COMPENSATE) {
  console.log('\n== compensating ==');
  const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.AUTHORITY_SECRET_KEY)));
  const mintPk = new PublicKey(process.env.USDC_MINT_REPAIR || process.env.USDC_MINT);
  const mintInfo = await getMint(connection, mintPk);
  console.log(`  authority=${authority.publicKey.toBase58()}  mint=${mintPk.toBase58()}`);
  if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(authority.publicKey)) {
    console.error('  ABORT: this authority is not the mint authority of that mint (wrong environment?)');
    await prisma.$disconnect();
    process.exit(1);
  }

  let ok = 0, failed = 0;
  for (const [wallet, owed] of userShortfall) {
    try {
      const ata = await getOrCreateAssociatedTokenAccount(connection, authority, mintPk, new PublicKey(wallet));
      const sig = await mintTo(connection, authority, mintPk, ata.address, authority, owed);
      ok++;
      console.log(`  ${mask(wallet)} +${usd(owed)} USDC  ${sig.slice(0, 12)}…`);
    } catch (e) {
      failed++;
      console.error(`  ${mask(wallet)} FAILED: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`  minted to ${ok} wallets, ${failed} failed`);
}

console.log('\nDone.');
await prisma.$disconnect();
