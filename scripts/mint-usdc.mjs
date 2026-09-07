/**
 * Mint devnet USDC to a wallet.
 *
 * The authority is read at run time and is never stored in this file. The
 * previous version inlined the secret key as a byte array, which put it in
 * every clone and fork of a public repository; that key has been rotated off
 * the mint and can no longer sign for it.
 *
 * Where the key comes from, in order:
 *   1. MINT_AUTHORITY_SECRET_KEY   a JSON array of 64 bytes
 *   2. MINT_AUTHORITY_KEYPAIR      a path to a keypair JSON file
 *   3. ~/.config/solana/updown-devnet-mint-authority.json
 *
 * Usage:
 *   node scripts/mint-usdc.mjs                        # defaults below
 *   node scripts/mint-usdc.mjs <wallet> [amount]
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const USDC_MINT = new PublicKey('By87mHK9Meinfv4AEqTx9qyYmGDLUcwiywpkkCWwGUVz');
const DEFAULT_WALLET = 'CB7VxLnXNATAk7oVcriUB11wuGAG8USYHkVJZZMCxQJd';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const DEFAULT_KEY_PATH = join(homedir(), '.config', 'solana', 'updown-devnet-mint-authority.json');

function loadAuthority() {
  const inline = process.env.MINT_AUTHORITY_SECRET_KEY;
  if (inline) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(inline)));
  }
  const path = process.env.MINT_AUTHORITY_KEYPAIR || DEFAULT_KEY_PATH;
  if (!existsSync(path)) {
    console.error(
      `No mint authority key found.\n\n` +
        `  Looked for MINT_AUTHORITY_SECRET_KEY, then MINT_AUTHORITY_KEYPAIR, then:\n` +
        `    ${path}\n\n` +
        `  The key lives outside the repository on purpose. Ask whoever holds it,\n` +
        `  or point MINT_AUTHORITY_KEYPAIR at your copy.`
    );
    process.exit(1);
  }
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(path, 'utf8'))));
}

async function main() {
  const targetWallet = new PublicKey(process.argv[2] || DEFAULT_WALLET);
  const amountUsdc = Number(process.argv[3] || 10_000);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    console.error(`Invalid amount: ${process.argv[3]}`);
    process.exit(1);
  }

  const authority = loadAuthority();
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('Authority pubkey:', authority.publicKey.toBase58());
  console.log('Target wallet:', targetWallet.toBase58());
  console.log('USDC Mint:', USDC_MINT.toBase58());

  const mintInfo = await getMint(connection, USDC_MINT);
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58());
  console.log('Decimals:', mintInfo.decimals);

  if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(authority.publicKey)) {
    console.error('ERROR: the key loaded is NOT the mint authority for this token.');
    console.error('Loaded:', authority.publicKey.toBase58());
    console.error('On chain:', mintInfo.mintAuthority?.toBase58() ?? '(none, minting is disabled)');
    process.exit(1);
  }

  console.log('\nCreating/finding token account for target wallet...');
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    authority, // payer
    USDC_MINT,
    targetWallet,
  );
  console.log('Token account:', tokenAccount.address.toBase58());

  const amountRaw = BigInt(amountUsdc) * BigInt(10 ** mintInfo.decimals);
  console.log(`\nMinting ${amountUsdc} USDC (${amountRaw} base units)...`);

  const txSig = await mintTo(
    connection,
    authority, // payer
    USDC_MINT,
    tokenAccount.address,
    authority, // mint authority
    amountRaw,
  );

  console.log('\nSuccess! TX:', txSig);
  console.log(`Minted ${amountUsdc} USDC to ${targetWallet.toBase58()}`);
}

main().catch(console.error);
