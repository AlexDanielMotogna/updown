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

/**
 * The on-exchange account (EVM/HL wallet) is already connected by a DIFFERENT
 * UpDown user. One account ↔ one user per network (anti dual-binding / XP farming).
 */
export class AccountLinkedElsewhereError extends Error {
  constructor() {
    super('This HyperLiquid account is already linked to another UpDown account');
    this.name = 'AccountLinkedElsewhereError';
  }
}

/**
 * Endpoint is derived STRICTLY from the connection's network flag — never from a
 * single shared URL env — so a mainnet connection can never accidentally route to
 * testnet (or vice-versa). Custom endpoints, if ever needed, should be per-network.
 */
function hlEndpoint(isTestnet: boolean): HlEndpoint {
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
export async function upsertConnection(input: UpsertConnectionInput & { active?: boolean }) {
  const exchange = input.exchange ?? 'hyperliquid';
  const isTestnet = input.isTestnet ?? false;
  const active = input.active ?? true;
  const data = {
    accountAddress: input.accountAddress.toLowerCase(),
    agentAddress: input.agentAddress.toLowerCase(),
    agentName: input.agentName ?? null,
    encryptedKeyData: encryptSecret(input.agentPrivateKey),
    approvedAt: input.approvedAt ?? (active ? new Date() : null),
    active,
  };
  return prisma.exchangeConnection.upsert({
    where: { userId_exchange_isTestnet: { userId: input.userId, exchange, isTestnet } },
    create: { userId: input.userId, exchange, isTestnet, ...data },
    update: data,
  });
}

/**
 * Step 1 of the agent-wallet flow: generate a fresh agent keypair, store it as a
 * PENDING (inactive) connection, and return the agent ADDRESS for the client to
 * approve on-chain (`approveAgent`) with the user's main EVM wallet. The private
 * key never leaves the server.
 */
export async function createPendingAgentConnection(input: {
  userId: string;
  accountAddress: string;
  agentName?: string;
  exchange?: ExchangeName;
  isTestnet?: boolean;
}): Promise<{ agentAddress: `0x${string}` }> {
  const exchange = input.exchange ?? 'hyperliquid';
  const isTestnet = input.isTestnet ?? false;
  const accountAddress = input.accountAddress.toLowerCase();

  const agent = generateAgentWallet();

  // Re-link (model i): a HyperLiquid/EVM account FOLLOWS the user connecting it
  // now. If another UpDown account previously claimed it, move it — drop their
  // (now-stale) connection so this user can own it. Safe: trade_fills dedupe by
  // globally-unique `tid`, so re-linking can't double-credit XP / farm.
  const claim = async () => {
    await prisma.exchangeConnection.deleteMany({
      where: { exchange, isTestnet, accountAddress, userId: { not: input.userId } },
    });
    await upsertConnection({
      userId: input.userId,
      exchange,
      accountAddress,
      agentPrivateKey: agent.privateKey,
      agentAddress: agent.address,
      agentName: input.agentName,
      isTestnet,
      active: false,
    });
  };

  try {
    await claim();
  } catch (e) {
    // P2002 = another user grabbed it between our delete and upsert. Retry once.
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') {
      await claim();
    } else {
      throw e;
    }
  }
  return { agentAddress: agent.address };
}

/** Step 2: mark the connection active once the client has approved the agent on-chain. */
export async function activateConnection(
  userId: string,
  exchange: ExchangeName = 'hyperliquid',
  isTestnet = false
) {
  return prisma.exchangeConnection.update({
    where: { userId_exchange_isTestnet: { userId, exchange, isTestnet } },
    data: { active: true, approvedAt: new Date() },
  });
}

type ConnectionRow = NonNullable<Awaited<ReturnType<typeof getConnection>>>;

/** Public-safe view of a connection — NEVER includes the encrypted key. */
export function serializeConnection(conn: ConnectionRow) {
  return {
    exchange: conn.exchange,
    accountAddress: conn.accountAddress,
    agentAddress: conn.agentAddress,
    agentName: conn.agentName,
    isTestnet: conn.isTestnet,
    active: conn.active,
    approvedAt: conn.approvedAt,
  };
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
