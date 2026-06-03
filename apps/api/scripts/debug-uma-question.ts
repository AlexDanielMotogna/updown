/**
 * Probe a single questionId against BOTH Polymarket adapters to figure
 * out which one Polymarket registered it with. Polymarket runs:
 *
 *   UmaCtfAdapter      — binary YES/NO markets (most PM_FINANCE)
 *   NegRiskCtfAdapter  — multi-outcome events (elections, brackets)
 *
 * Our resolver only knows about the first one. If readUmaQuestion()
 * returns 'pending' for a market that's clearly resolved, the question
 * almost certainly lives on the negRisk adapter.
 *
 * Usage:
 *   POLYGON_RPC_URL=... npx tsx scripts/debug-uma-question.ts <questionId>
 */
import 'dotenv/config';
import { createPublicClient, getAddress, http, type PublicClient, type Hex } from 'viem';
import { polygon } from 'viem/chains';
import { UMA_CTF_ADAPTER_ABI } from '../src/services/polymarket/uma-resolver';

const UMA_CTF_ADAPTER = getAddress('0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74');
const NEG_RISK_CTF_ADAPTER = getAddress('0x2f5e3684cb1f318ec51b00edba38d79ac2c7c53c');

async function probe(client: PublicClient, address: `0x${string}`, label: string, questionId: Hex): Promise<void> {
  try {
    const raw = await client.readContract({
      address,
      abi: UMA_CTF_ADAPTER_ABI,
      functionName: 'getQuestion',
      args: [questionId],
    });
    const [requestTimestamp, creator, rewardToken, reward, proposalBond, emergencyResolutionTimestamp, resolved, paused, reset, ancillaryData] = raw as readonly [bigint, `0x${string}`, `0x${string}`, bigint, bigint, bigint, boolean, boolean, boolean, `0x${string}`];
    console.log(`  ${label} (${address.slice(0, 8)}…):`);
    console.log(`    requestTimestamp = ${requestTimestamp}${requestTimestamp > 0n ? ` (${new Date(Number(requestTimestamp) * 1000).toISOString()})` : ' (never registered)'}`);
    console.log(`    creator = ${creator}`);
    console.log(`    rewardToken = ${rewardToken}  reward = ${reward}  bond = ${proposalBond}`);
    console.log(`    resolved=${resolved}  paused=${paused}  reset=${reset}`);
    if (emergencyResolutionTimestamp > 0n) {
      console.log(`    emergencyResolutionTimestamp = ${emergencyResolutionTimestamp}`);
    }
    console.log(`    ancillaryData = ${ancillaryData.slice(0, 80)}…`);
  } catch (err) {
    console.log(`  ${label} (${address.slice(0, 8)}…): READ FAILED — ${err instanceof Error ? err.message.slice(0, 80) : err}`);
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: npx tsx scripts/debug-uma-question.ts <questionId>');
    process.exit(1);
  }
  const questionId = (arg.toLowerCase().startsWith('0x') ? arg.toLowerCase() : `0x${arg.toLowerCase()}`) as Hex;
  if (questionId.length !== 66) {
    console.error('questionId must be 0x + 64 hex chars');
    process.exit(1);
  }

  const client = createPublicClient({
    chain: polygon,
    transport: http(process.env.POLYGON_RPC_URL),
  });

  console.log(`Probing questionId ${questionId}\n`);
  await probe(client, UMA_CTF_ADAPTER, 'UmaCtfAdapter   ', questionId);
  await probe(client, NEG_RISK_CTF_ADAPTER, 'NegRiskAdapter', questionId);
}

main().catch(err => { console.error(err); process.exit(1); });
