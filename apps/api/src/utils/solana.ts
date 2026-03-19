import { PublicKey, Connection, Keypair } from '@solana/web3.js';

// Solana connection (lazy to ensure dotenv has loaded)
let _connection: Connection | null = null;
export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
  }
  return _connection;
}

// USDC mint  lazy to ensure dotenv has loaded before reading env
let _usdcMint: PublicKey | null = null;
export function getUsdcMint(): PublicKey {
  if (!_usdcMint) {
    _usdcMint = new PublicKey(process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  }
  return _usdcMint;
}

// Load authority keypair for server-signed transactions (claims)
export function getAuthorityKeypair(): Keypair {
  // Try direct secret key first
  const secretKey = process.env.AUTHORITY_SECRET_KEY;
  if (secretKey) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  }

  // Try loading from file path
  const keypairPath = process.env.AUTHORITY_KEYPAIR_PATH;
  if (keypairPath) {
    const fs = require('fs');
    const path = require('path');
    const resolvedPath = keypairPath.startsWith('~')
      ? path.join(process.env.HOME || '', keypairPath.slice(1))
      : keypairPath;
    const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fileContent)));
  }

  throw new Error('AUTHORITY_SECRET_KEY or AUTHORITY_KEYPAIR_PATH not configured');
}

/** Derive deterministic 32-byte seed from a pool UUID via SHA-256. */
export function derivePoolSeed(poolUuid: string): Buffer {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(poolUuid).digest();
}
