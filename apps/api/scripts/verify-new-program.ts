/**
 * Verify the freshly-deployed program end-to-end:
 *  1. The latest pool exists ON-CHAIN under the NEW program (InitializePool works).
 *  2. A `deposit` SIMULATES cleanly (the real seeds/handler test — discriminator
 *     match alone isn't enough; catches ConstraintSeeds / stale-layout).
 * Run: pnpm --filter api exec tsx scripts/verify-new-program.ts
 */
import { Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { PROGRAM_ID, getPoolPDA, getVaultPDA, getUserBetPDA, buildDepositIx } from 'solana-client';
import { prisma } from '../src/db';
import { getConnection, getAuthorityKeypair, getUsdcMint, derivePoolSeed } from '../src/utils/solana';

async function main() {
  console.log('PROGRAM_ID (client):', PROGRAM_ID.toBase58());

  const pool =
    (await prisma.pool.findFirst({ where: { poolType: 'CRYPTO' }, orderBy: { createdAt: 'desc' } })) ??
    (await prisma.pool.findFirst({ orderBy: { createdAt: 'desc' } }));
  if (!pool) { console.log('No pools in DB yet — wait for the scheduler to create one.'); return; }
  console.log(`Pool: ${pool.id} (${pool.poolType} ${pool.asset}) status=${pool.status} numSides=${pool.numSides}`);

  const conn = getConnection();
  const seed = derivePoolSeed(pool.id);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);

  // 1) On-chain existence + owner.
  const info = await conn.getAccountInfo(poolPda);
  if (!info) { console.log('❌ Pool PDA NOT on-chain:', poolPda.toBase58()); return; }
  console.log(`✓ Pool on-chain: ${poolPda.toBase58()} (owner=${info.owner.toBase58()}, ${info.data.length} bytes)`);
  console.log(`  owner === new program: ${info.owner.equals(PROGRAM_ID)}`);

  // 2) Simulate a deposit (side 0 = Up/Home) with the authority as bettor.
  const authority = getAuthorityKeypair();
  const usdcMint = getUsdcMint();
  const userAta = await getAssociatedTokenAddress(usdcMint, authority.publicKey);
  const [userBet] = getUserBetPDA(poolPda, authority.publicKey, 0);

  const ix = buildDepositIx(poolPda, userBet, vaultPda, userAta, authority.publicKey, 0, 1_000_000n);
  const tx = new Transaction().add(ix);
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(authority);

  const sim = await conn.simulateTransaction(tx);
  console.log('--- deposit simulation ---');
  console.log('err:', JSON.stringify(sim.value.err));
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).filter((l) => /Error|insufficient|Constraint|AnchorError/i.test(l));
    console.log('relevant logs:', JSON.stringify(logs, null, 1));
    const txt = JSON.stringify(sim.value);
    if (/ConstraintSeeds|2006|AccountDidNotSerialize|0xbbc/i.test(txt)) console.log('❌ PROGRAM/seeds error — handler mismatch.');
    else if (/insufficient|0x1\b|custom program error: 0x1/i.test(txt)) console.log('✓ Seeds/handler OK — failure is downstream (likely no USDC in authority ATA).');
    else console.log('⚠️  Unrecognized error — inspect logs above.');
  } else {
    console.log('✓✓ Deposit simulates clean (err: null) — full create→bet cycle works on the new program.');
  }
}

main().catch((e) => { console.error('ERR', e); process.exit(1); }).finally(() => prisma.$disconnect());
