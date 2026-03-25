import { PublicKey, Connection, Keypair } from '@solana/web3.js';

/**
 * RPC connection with automatic failover.
 * Cycles through multiple RPC endpoints when one fails (429, timeout, errors).
 * Set SOLANA_RPC_URLS as comma-separated list, falls back to SOLANA_RPC_URL.
 */
let _connectionManager: RpcConnectionManager | null = null;

class RpcConnectionManager {
  private endpoints: string[];
  private connections: Connection[];
  private currentIndex = 0;
  private failCounts: number[];

  constructor(endpoints: string[]) {
    this.endpoints = endpoints;
    this.connections = endpoints.map(url => new Connection(url, 'confirmed'));
    this.failCounts = endpoints.map(() => 0);
    console.log(`[RPC] Initialized with ${endpoints.length} endpoint(s):`);
    endpoints.forEach((url, i) => {
      // Mask API keys in logs
      const masked = url.replace(/([?&]api-key=|\/v2\/|\/v1\/)([^&/]+)/, '$1***');
      console.log(`[RPC]   ${i + 1}. ${masked}`);
    });
  }

  /** Get current active connection */
  get(): Connection {
    return this.connections[this.currentIndex];
  }

  /** Report a failure on the current endpoint and rotate to next */
  reportFailure(): Connection {
    const failed = this.endpoints[this.currentIndex];
    const masked = failed.replace(/([?&]api-key=|\/v2\/|\/v1\/)([^&/]+)/, '$1***');
    this.failCounts[this.currentIndex]++;
    const prevIndex = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    console.warn(`[RPC] Endpoint ${prevIndex + 1} failed (${masked}), switching to endpoint ${this.currentIndex + 1}`);
    return this.connections[this.currentIndex];
  }

  /** Get stats for health monitoring */
  getStats() {
    return this.endpoints.map((url, i) => ({
      endpoint: url.replace(/([?&]api-key=|\/v2\/|\/v1\/)([^&/]+)/, '$1***'),
      active: i === this.currentIndex,
      failures: this.failCounts[i],
    }));
  }
}

function getRpcManager(): RpcConnectionManager {
  if (!_connectionManager) {
    // Parse endpoints: SOLANA_RPC_URLS (comma-separated) or single SOLANA_RPC_URL
    const urlsEnv = process.env.SOLANA_RPC_URLS;
    let endpoints: string[];

    if (urlsEnv) {
      endpoints = urlsEnv.split(',').map(u => u.trim()).filter(Boolean);
    } else {
      endpoints = [process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'];
    }

    _connectionManager = new RpcConnectionManager(endpoints);
  }
  return _connectionManager;
}

export function getConnection(): Connection {
  return getRpcManager().get();
}

/** Report RPC failure and get the next connection */
export function rotateConnection(): Connection {
  return getRpcManager().reportFailure();
}

/** Get RPC stats for admin health endpoint */
export function getRpcStats() {
  return getRpcManager().getStats();
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

/** Derive deterministic 32-byte seed from a tournament UUID via SHA-256. */
export function deriveTournamentSeed(tournamentUuid: string): Buffer {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(`tournament:${tournamentUuid}`).digest();
}
