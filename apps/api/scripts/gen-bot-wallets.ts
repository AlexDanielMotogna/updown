import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { isDevnet } from '../src/utils/solana';
import { fundBotWallet, getUsdcBalance, getSolBalance } from '../src/services/liquidity-bot/funding';

const N = 6;
const USDC_TARGET = 100_000_000n;               // 100 USDC each
const SOL_TARGET = Math.round(0.05 * LAMPORTS_PER_SOL);

async function main() {
  if (!isDevnet()) {
    console.error('Refusing: not devnet (would mint/transfer real funds). Aborting.');
    process.exit(1);
  }
  const kps = Array.from({ length: N }, () => Keypair.generate());
  const keysJson = JSON.stringify(kps.map(k => Array.from(k.secretKey)));

  console.log(`Generated ${N} devnet bot wallets. Funding...\n`);
  for (const k of kps) {
    try {
      await fundBotWallet(k.publicKey, USDC_TARGET, SOL_TARGET);
      const usdc = await getUsdcBalance(k.publicKey);
      const sol = await getSolBalance(k.publicKey);
      console.log(`  ${k.publicKey.toBase58()}  ->  ${Number(usdc) / 1e6} USDC, ${(sol / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
    } catch (e) {
      console.error(`  fund failed ${k.publicKey.toBase58()}:`, e instanceof Error ? e.message : e);
    }
  }

  // Persist to .env (append only if not already present — we never read the file).
  const envPath = path.resolve(process.cwd(), '.env');
  if (process.env.LIQUIDITY_BOT_KEYS) {
    console.log('\nLIQUIDITY_BOT_KEYS already set in env — NOT overwriting. New value below if you want to replace it:');
    console.log(`\nLIQUIDITY_BOT_KEYS=${keysJson}\n`);
  } else {
    fs.appendFileSync(envPath, `\nLIQUIDITY_BOT_KEYS=${keysJson}\n`);
    console.log(`\nAppended LIQUIDITY_BOT_KEYS (${N} wallets) to ${envPath}`);
  }
  console.log('\nDone. Restart the API and enable the bot from Admin -> Liquidity.');
}

main().catch(e => { console.error(e); process.exit(1); });
