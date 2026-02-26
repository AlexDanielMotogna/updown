/**
 * Script to create test pools manually
 * Usage: npx tsx scripts/create-pool.ts [asset] [minutesUntilStart]
 * Example: npx tsx scripts/create-pool.ts BTC 5
 */

import { PrismaClient } from '@prisma/client';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function createPool(asset: string, minutesUntilStart: number = 2) {
  const now = new Date();

  // Pool timing
  const startTime = new Date(now.getTime() + minutesUntilStart * 60 * 1000);
  const lockTime = new Date(startTime.getTime() - 1 * 60 * 1000); // 1 min before start
  const endTime = new Date(startTime.getTime() + 1 * 60 * 1000); // 1 hour duration

  // Generate unique pool ID
  const poolIdBytes = crypto.randomBytes(32);
  const poolKeypair = Keypair.generate();
  const poolId = poolKeypair.publicKey.toBase58();

  const pool = await prisma.pool.create({
    data: {
      poolId,
      asset: asset.toUpperCase(),
      status: 'UPCOMING',
      startTime,
      endTime,
      lockTime,
    },
  });

  console.log(`\n✅ Pool created successfully!`);
  console.log(`   ID: ${pool.id}`);
  console.log(`   Asset: ${pool.asset}`);
  console.log(`   Status: ${pool.status}`);
  console.log(`   Lock Time: ${pool.lockTime.toISOString()} (deposits close)`);
  console.log(`   Start Time: ${pool.startTime.toISOString()} (becomes ACTIVE)`);
  console.log(`   End Time: ${pool.endTime.toISOString()} (resolves)`);
  console.log(`\n   Will transition to JOINING in ~${minutesUntilStart - 1} minutes`);

  return pool;
}

async function main() {
  const asset = process.argv[2] || 'BTC';
  const minutes = parseInt(process.argv[3] || '5', 10);

  console.log(`Creating ${asset} pool starting in ${minutes} minutes...`);

  await createPool(asset, minutes);
  await prisma.$disconnect();
}

main().catch(console.error);
