import { PublicKey, Connection, Keypair } from '@solana/web3.js';

/**
 * RPC connection with automatic failover.
 * Cycles through multiple RPC endpoints when one fails (429, timeout, errors).
 * Set SOLANA_RPC_URLS as comma-separated list, falls back to SOLANA_RPC_URL.
 */
let _connectionManager: RpcConnectionManager | null = null;

const maskUrl = (url: string) => url.replace(/([?&]api-key=|\/v2\/|\/v1\/)([^&/]+)/, '$1***');
const rpcSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

class RpcConnectionManager {
  private endpoints: string[];
  private currentIndex = 0;
  private failCounts: number[];
  private connection: Connection;

  constructor(endpoints: string[]) {
    this.endpoints = endpoints;
    this.failCounts = endpoints.map(() => 0);
    console.log(`[RPC] Initialized with ${endpoints.length} endpoint(s):`);
    endpoints.forEach((url, i) => console.log(`[RPC]   ${i + 1}. ${maskUrl(url)}`));
    // A single Connection whose fetch dynamically targets the ACTIVE endpoint
    // and rotates to the next on 429 / 5xx / network error (with backoff). This
    // makes failover transparent to every caller — no need to swap the
    // Connection instance or wrap individual RPC calls.
    this.connection = new Connection(endpoints[0], {
      commitment: 'confirmed',
      fetch: this.fetchWithFailover.bind(this),
    });
  }

  private rotate() {
    this.failCounts[this.currentIndex]++;
    const prev = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    if (this.endpoints.length > 1) {
      console.warn(`[RPC] endpoint ${prev + 1} (${maskUrl(this.endpoints[prev])}) rate-limited/failed → switching to ${this.currentIndex + 1}`);
    }
  }

  /** fetch that rotates endpoints on rate-limit / transient failure. */
  private async fetchWithFailover(_input: unknown, init?: RequestInit): Promise<Response> {
    const maxAttempts = this.endpoints.length + 2;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const url = this.endpoints[this.currentIndex];
      try {
        const res = await fetch(url, init);
        if (res.status === 429 || res.status === 502 || res.status === 503) {
          this.rotate();
          await rpcSleep(Math.min(2000, 250 * 2 ** attempt));
          continue;
        }
        return res;
      } catch (e) {
        lastErr = e;
        this.rotate();
        await rpcSleep(Math.min(2000, 250 * 2 ** attempt));
      }
    }
    // Exhausted retries: surface the real error / final response to the caller.
    if (lastErr) throw lastErr;
    return fetch(this.endpoints[this.currentIndex], init);
  }

  /** Get the (single, self-failing-over) connection */
  get(): Connection {
    return this.connection;
  }

  /** Manual rotate (failover is also automatic in the fetch layer). */
  reportFailure(): Connection {
    this.rotate();
    return this.connection;
  }

  /** Get stats for health monitoring */
  getStats() {
    return this.endpoints.map((url, i) => ({
      endpoint: maskUrl(url),
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

/**
 * Which cluster we're pointed at, inferred from the RPC URL. Used by the
 * liquidity bot to pick its funding strategy (devnet = mint free, mainnet =
 * transfer real USDC from treasury). Defaults to 'mainnet' (the safe assumption
 * — a misconfigured RPC must NOT be treated as devnet).
 */
export function getCluster(): 'devnet' | 'mainnet' {
  // Explicit override wins — RPC hostnames don't always contain "devnet"
  // (Helius/QuickNode custom endpoints), so prod can force the cluster.
  const override = (process.env.SOLANA_CLUSTER || '').toLowerCase().trim();
  if (override === 'devnet' || override === 'testnet') return 'devnet';
  if (override === 'mainnet' || override === 'mainnet-beta') return 'mainnet';

  const rpc = (process.env.SOLANA_RPC_URL || process.env.SOLANA_RPC_URLS || 'https://api.devnet.solana.com').toLowerCase();
  if (rpc.includes('devnet') || rpc.includes('testnet') || rpc.includes('localhost') || rpc.includes('127.0.0.1')) {
    return 'devnet';
  }
  return 'mainnet';
}

export function isDevnet(): boolean {
  return getCluster() === 'devnet';
}

/** Treasury wallet that funds liquidity-bot wallets on mainnet (real USDC+SOL).
 *  Null when not configured (devnet uses mint authority instead). */
export function getTreasuryKeypair(): Keypair | null {
  const sk = process.env.TREASURY_SECRET_KEY;
  if (!sk) return null;
  try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(sk))); } catch { return null; }
}

/** Liquidity-bot wallets. LIQUIDITY_BOT_KEYS is a JSON array of secret-key
 *  arrays: [[..64..],[..64..],...]. Empty array when not configured. */
export function getLiquidityBotKeypairs(): Keypair[] {
  const raw = process.env.LIQUIDITY_BOT_KEYS;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((sk: number[]) => Keypair.fromSecretKey(Uint8Array.from(sk)));
  } catch { return []; }
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
