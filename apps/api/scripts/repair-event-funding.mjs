/**
 * Repair half-funded Crypto Predictions accounts.
 *
 * Two things went wrong while the authority was out of SOL:
 *   1. Wallets got their 1000 test USDC but no SOL, so every gasless deposit died
 *      with InsufficientFundsForRent and they could not place a single bet.
 *   2. `mintTestFunds` released the one-time claim when a leg failed after the mint
 *      landed, so `users.auto_funded_at` reads null for wallets that DO hold funds.
 *
 * This tops such wallets up to TEST_FUNDS_SOL and re-stamps `auto_funded_at` for
 * anyone already holding USDC on-chain. Idempotent: run it as many times as needed.
 *
 * Usage (from apps/api):
 *   node -r dotenv/config scripts/repair-event-funding.mjs                 # dry run, prod
 *   node -r dotenv/config scripts/repair-event-funding.mjs --apply         # execute
 *   node -r dotenv/config scripts/repair-event-funding.mjs --env=dev --apply
 *
 * Requires AUTHORITY_SECRET_KEY of the TARGET environment. The script prints the
 * authority address first; check it matches that environment before using --apply.
 */
import { PrismaClient } from '@prisma/client';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

const APPLY = process.argv.includes('--apply');
const envArg = (process.argv.find((a) => a.startsWith('--env=')) ?? '--env=prod').split('=')[1];
const DB_URL = envArg === 'dev' ? process.env.DEV_DIRECT_URL : envArg === 'local' ? process.env.DIRECT_URL : process.env.PROD_DIRECT_URL;
if (!DB_URL) { console.error(`No database URL for --env=${envArg}`); process.exit(1); }

const RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const MINT = new PublicKey(process.env.USDC_MINT_REPAIR || process.env.USDC_MINT);
const TARGET_SOL = Number(process.env.TEST_FUNDS_SOL_REPAIR ?? 0.05);
const TARGET_LAMPORTS = Math.round(TARGET_SOL * LAMPORTS_PER_SOL);
// A wallet needs the UserBet rent plus its own rent-exempt minimum to bet gasless.
const MIN_LAMPORTS = 890_880 + 1_691_280;

const prisma = new PrismaClient({ datasourceUrl: DB_URL });
const c = new Connection(RPC, 'confirmed');
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.AUTHORITY_SECRET_KEY)));
const mask = (w) => `${w.slice(0, 4)}..${w.slice(-4)}`;

console.log(`env=${envArg}  rpc=${RPC.replace(/(api-key=|v2\/)[^&/]+/, '$1<key>')}  mint=${MINT.toBase58()}`);
console.log(`authority=${authority.publicKey.toBase58()}  balance=${((await c.getBalance(authority.publicKey)) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
console.log(APPLY ? 'MODE: APPLY\n' : 'MODE: dry run (pass --apply to execute)\n');

const users = await prisma.user.findMany({
  where: { OR: [{ signupIp: { not: null } }, { autoFundedAt: { not: null } }] },
  select: { walletAddress: true, autoFundedAt: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
});

const work = [];
for (let i = 0; i < users.length; i += 20) {
  const chunk = users.slice(i, i + 20);
  const infos = await c.getMultipleAccountsInfo(chunk.map((u) => new PublicKey(u.walletAddress)));
  for (let j = 0; j < chunk.length; j++) {
    const u = chunk[j];
    const lamports = infos[j]?.lamports ?? 0;
    if (lamports >= MIN_LAMPORTS && u.autoFundedAt) continue;

    let usdc = 0;
    try {
      usdc = Number((await getAccount(c, await getAssociatedTokenAddress(MINT, new PublicKey(u.walletAddress)))).amount) / 1e6;
    } catch { usdc = 0; }

    const needsSol = lamports < MIN_LAMPORTS;
    const needsFlag = !u.autoFundedAt && usdc > 0;
    if (needsSol || needsFlag) work.push({ wallet: u.walletAddress, lamports, usdc, needsSol, needsFlag });
  }
}

if (work.length === 0) { console.log('Nothing to repair.'); await prisma.$disconnect(); process.exit(0); }

console.table(work.map((w) => ({ wallet: mask(w.wallet), sol: +(w.lamports / LAMPORTS_PER_SOL).toFixed(4), usdc: w.usdc, 'top up SOL': w.needsSol, 'fix flag': w.needsFlag })));

const solNeeded = work.filter((w) => w.needsSol).reduce((acc, w) => acc + Math.max(0, TARGET_LAMPORTS - w.lamports), 0);
console.log(`\n${work.length} wallets, SOL to send: ${(solNeeded / LAMPORTS_PER_SOL).toFixed(4)}`);
if (!APPLY) { console.log('Dry run, nothing sent.'); await prisma.$disconnect(); process.exit(0); }

let sent = 0, flagged = 0;
for (const w of work) {
  try {
    if (w.needsSol) {
      const lamports = Math.max(0, TARGET_LAMPORTS - w.lamports);
      if (lamports > 0) {
        const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: new PublicKey(w.wallet), lamports }));
        const sig = await sendAndConfirmTransaction(c, tx, [authority], { commitment: 'confirmed' });
        sent++;
        console.log(`  ${mask(w.wallet)} +${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL  ${sig.slice(0, 12)}…`);
      }
    }
    if (w.needsFlag) {
      await prisma.user.updateMany({ where: { walletAddress: w.wallet, autoFundedAt: null }, data: { autoFundedAt: new Date() } });
      flagged++;
      console.log(`  ${mask(w.wallet)} auto_funded_at stamped (holds ${w.usdc} USDC)`);
    }
  } catch (e) {
    console.error(`  ${mask(w.wallet)} FAILED: ${e instanceof Error ? e.message : e}`);
  }
}

console.log(`\nDone. SOL transfers: ${sent}, flags fixed: ${flagged}.`);
await prisma.$disconnect();
