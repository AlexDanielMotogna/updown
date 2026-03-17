import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

const USDC_MINT = new PublicKey('By87mHK9Meinfv4AEqTx9qyYmGDLUcwiywpkkCWwGUVz');
const TARGET_WALLET = new PublicKey('CB7VxLnXNATAk7oVcriUB11wuGAG8USYHkVJZZMCxQJd');
const RPC_URL = 'https://api.devnet.solana.com';
const AMOUNT_USDC = 10_000; // 10,000 USDC

// Authority keypair from .env
const secretKey = new Uint8Array([20,135,159,140,59,3,74,145,215,18,95,254,207,209,181,194,37,243,30,3,84,129,168,137,214,243,20,188,158,192,157,59,37,160,111,141,22,214,139,97,61,149,252,14,86,46,94,124,194,130,125,120,66,183,75,85,65,61,143,109,41,42,211,33]);
const authority = Keypair.fromSecretKey(secretKey);

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('Authority pubkey:', authority.publicKey.toBase58());
  console.log('Target wallet:', TARGET_WALLET.toBase58());
  console.log('USDC Mint:', USDC_MINT.toBase58());

  // Check mint info to verify authority
  const mintInfo = await getMint(connection, USDC_MINT);
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58());
  console.log('Decimals:', mintInfo.decimals);

  if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(authority.publicKey)) {
    console.error('ERROR: Authority key is NOT the mint authority for this token!');
    console.error('Expected:', authority.publicKey.toBase58());
    console.error('Got:', mintInfo.mintAuthority?.toBase58());
    process.exit(1);
  }

  // Get or create the associated token account for target wallet
  console.log('\nCreating/finding token account for target wallet...');
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    authority, // payer
    USDC_MINT,
    TARGET_WALLET,
  );
  console.log('Token account:', tokenAccount.address.toBase58());

  // Mint tokens (amount in base units: USDC has 6 decimals)
  const amountRaw = BigInt(AMOUNT_USDC) * BigInt(10 ** mintInfo.decimals);
  console.log(`\nMinting ${AMOUNT_USDC} USDC (${amountRaw} base units)...`);

  const txSig = await mintTo(
    connection,
    authority, // payer
    USDC_MINT,
    tokenAccount.address,
    authority, // mint authority
    amountRaw,
  );

  console.log('\nSuccess! TX:', txSig);
  console.log(`Minted ${AMOUNT_USDC} USDC to ${TARGET_WALLET.toBase58()}`);
}

main().catch(console.error);
