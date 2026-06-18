/**
 * Exchange connection service — the per-user agent-wallet lifecycle (ADR-003).
 *
 * The "3 pieces" (do not confuse):
 *  1. Agent wallet private key — THE signing key, random per user, stored
 *     AES-encrypted in ExchangeConnection.encryptedKeyData.
 *  2. EXCHANGE_KEY_ENCRYPTION_SECRET — master key that wraps the agent keys
 *     (utils/exchange-keys). Signs nothing.
 *  3. HYPERLIQUID_BUILDER_ADDRESS/_FEE — builder code that receives the fee.
 *     Signs nothing.
 *
 * Flow: server generates an agent keypair → returns the agent ADDRESS to the
 * client → the user's MAIN wallet signs `approveAgent(agentAddress)` in the
 * browser → server encrypts + stores the agent key here. At sign time we decrypt
 * and build a HyperliquidSigner bound to that agent key.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { HyperliquidSigner, MAINNET, TESTNET, type HlEndpoint } from 'exchange-hyperliquid';
import { prisma } from '../db';
import { decryptSecret, encryptSecret } from '../utils/exchange-keys';

export type ExchangeName = 'hyperliquid';

function hlEndpoint(isTestnet: boolean): HlEndpoint {
  const url = process.env.HYPERLIQUID_API_URL;
  if (url) return { apiUrl: url };
  return isTestnet ? TESTNET : MAINNET;
}

/** Builder code from env, or undefined if not configured. */
function builderConfig(): { address: `0x${string}`; feeTenthsBps: number } | undefined {
  const address = process.env.HYPERLIQUID_BUILDER_ADDRESS as `0x${string}` | undefined;
  const fee = Number(process.env.HYPERLIQUID_BUILDER_FEE);
  if (address && Number.isFinite(fee) && fee > 0) {
    return { address, feeTenthsBps: fee };
  }
  return undefined;
}

/**
 * Generate a fresh agent keypair. The PRIVATE key is returned only so the caller
 * can immediately encrypt+store it; the ADDRESS is what the user's main wallet
 * approves on-chain. Never log or persist the private key in plaintext.
 */
export function generateAgentWallet(): { privateKey: `0x${string}`; address: `0x${string}` } {
  const privateKey = generatePrivateKey();
  const { address } = privateKeyToAccount(privateKey);
  return { privateKey, address };
}

export interface UpsertConnectionInput {
  userId: string;
  exchange?: ExchangeName;
  /** The user's REAL on-exchange account address (the wallet that ran approveAgent). */
  accountAddress: string;
  /** The agent key to store (will be AES-encrypted at rest). */
  agentPrivateKey: `0x${string}`;
  agentAddress: string;
  agentName?: string;
  isTestnet?: boolean;
  approvedAt?: Date;
}

/** Create or replace a user's connection for an exchange + network. */
export async function upsertConnection(input: UpsertConnectionInput) {
  const exchange = input.exchange ?? 'hyperliquid';
  const isTestnet = input.isTestnet ?? false;
  const data = {
    accountAddress: input.accountAddress.toLowerCase(),
    agentAddress: input.agentAddress.toLowerCase(),
    agentName: input.agentName ?? null,
    encryptedKeyData: encryptSecret(input.agentPrivateKey),
    approvedAt: input.approvedAt ?? new Date(),
    active: true,
  };
  return prisma.exchangeConnection.upsert({
    where: { userId_exchange_isTestnet: { userId: input.userId, exchange, isTestnet } },
    create: { userId: input.userId, exchange, isTestnet, ...data },
    update: data,
  });
}

export async function getConnection(
  userId: string,
  exchange: ExchangeName = 'hyperliquid',
  isTestnet = false
) {
  return prisma.exchangeConnection.findUnique({
    where: { userId_exchange_isTestnet: { userId, exchange, isTestnet } },
  });
}

/** Decrypt the stored agent private key. Keep the result in memory only. */
export function decryptAgentKey(encryptedKeyData: string): `0x${string}` {
  return decryptSecret(encryptedKeyData) as `0x${string}`;
}

/**
 * Build a ready-to-sign HyperliquidSigner for a user by decrypting their stored
 * agent key. Throws if there is no active connection.
 */
export async function buildHyperliquidSigner(
  userId: string,
  opts: { isTestnet?: boolean } = {}
): Promise<HyperliquidSigner> {
  const isTestnet = opts.isTestnet ?? false;
  const conn = await getConnection(userId, 'hyperliquid', isTestnet);
  if (!conn || !conn.active) {
    throw new Error(`No active hyperliquid connection for user ${userId} (testnet=${isTestnet})`);
  }
  return new HyperliquidSigner({
    privateKey: decryptAgentKey(conn.encryptedKeyData),
    endpoint: hlEndpoint(isTestnet),
    builder: builderConfig(),
  });
}
