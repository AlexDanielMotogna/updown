/**
 * Probe Polymarket's ConditionalTokens (CTF) contract for the resolved
 * outcome of a single conditionId.
 *
 * The CTF lives at 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 on Polygon
 * and is the SAME address for every Polymarket market regardless of the
 * adapter that wrapped the UMA request. That makes it the cleanest
 * single-contract source of truth.
 *
 * Key reads:
 *   - payoutNumerators(conditionId, index) → uint
 *     For a binary YES/NO market: [1, 0] = YES won, [0, 1] = NO won.
 *     Both 0 means not resolved yet.
 *   - payoutDenominator(conditionId) → uint
 *     0 when unresolved, sum(numerators) otherwise.
 *
 * Usage:
 *   POLYGON_RPC_URL=... npx tsx scripts/probe-ctf.ts <conditionId>
 */
import 'dotenv/config';
import { createPublicClient, getAddress, http, type Hex } from 'viem';
import { polygon } from 'viem/chains';

const CTF_POLYGON = getAddress('0x4D97DCd97eC945f40cF65F87097ACe5EA0476045');

const CTF_ABI = [
  {
    type: 'function', name: 'payoutNumerators', stateMutability: 'view',
    inputs: [
      { name: 'conditionId', type: 'bytes32' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'payoutDenominator', stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'getOutcomeSlotCount', stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: npx tsx scripts/probe-ctf.ts <conditionId>');
    process.exit(1);
  }
  const conditionId = (arg.toLowerCase().startsWith('0x') ? arg.toLowerCase() : `0x${arg.toLowerCase()}`) as Hex;
  if (conditionId.length !== 66) {
    console.error('conditionId must be 0x + 64 hex chars');
    process.exit(1);
  }

  const c = createPublicClient({ chain: polygon, transport: http(process.env.POLYGON_RPC_URL) });

  console.log(`Probing CTF for conditionId ${conditionId}\n`);

  const denominator = await c.readContract({ address: CTF_POLYGON, abi: CTF_ABI, functionName: 'payoutDenominator', args: [conditionId] });
  const slotCount = await c.readContract({ address: CTF_POLYGON, abi: CTF_ABI, functionName: 'getOutcomeSlotCount', args: [conditionId] });
  console.log(`  payoutDenominator = ${denominator}  ${denominator === 0n ? '(NOT RESOLVED)' : '(resolved)'}`);
  console.log(`  getOutcomeSlotCount = ${slotCount}`);

  const slots = Number(slotCount) || 2;
  const numerators: bigint[] = [];
  for (let i = 0; i < slots; i++) {
    const n = await c.readContract({ address: CTF_POLYGON, abi: CTF_ABI, functionName: 'payoutNumerators', args: [conditionId, BigInt(i)] });
    numerators.push(n as bigint);
  }
  console.log(`  payoutNumerators = [${numerators.join(', ')}]`);
  if (denominator > 0n) {
    if (numerators[0] > 0n && numerators[1] === 0n) console.log(`  → YES / HOME won`);
    else if (numerators[0] === 0n && numerators[1] > 0n) console.log(`  → NO / AWAY won`);
    else if (numerators[0] > 0n && numerators[1] > 0n) console.log(`  → Split / refund (numerators equal)`);
    else console.log(`  → Outcome unclear`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
