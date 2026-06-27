/**
 * HyperLiquid deposit relayer — the bridge "last mile".
 *
 * After USDC lands on the user's Arbitrum wallet, the user signs an off-chain
 * EIP-2612 USDC permit (gasless, no ETH). Our relayer submits HL Bridge2's
 * `batchedDepositWithPermit`, paying the (cents) Arbitrum gas, and HL credits the
 * USER (the permit carries owner=user). The relayer needs ETH on Arbitrum.
 *
 * ABI (verified against hyperliquid-dex/contracts Bridge2.sol + Signature.sol):
 *   batchedDepositWithPermit(DepositWithPermit[])
 *   DepositWithPermit { address user; uint64 usd; uint64 deadline; Signature signature; }
 *   Signature        { uint256 r; uint256 s; uint8 v; }
 */
import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum, arbitrumSepolia } from 'viem/chains';

const IS_TESTNET = process.env.BRIDGE_HL_TESTNET === 'true';

/** HL Bridge2 (spender). Mainnet / testnet per the HL docs. */
export const HL_BRIDGE_ADDRESS: Hex = IS_TESTNET
  ? '0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89'
  : '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';

/** Native USDC on Arbitrum (permit verifyingContract). */
export const ARBITRUM_USDC: Hex = IS_TESTNET
  ? '0x1baAbB04529D43a73232B713C0FE471f7c7334d5'
  : '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

/** EIP-2612 permit domain expected by Arbitrum USDC (per HL docs). */
export const PERMIT_DOMAIN = {
  name: IS_TESTNET ? 'USDC2' : 'USD Coin',
  version: IS_TESTNET ? '1' : '2',
  chainId: IS_TESTNET ? 421614 : 42161,
};

const chain = IS_TESTNET ? arbitrumSepolia : arbitrum;

const BRIDGE_ABI = [
  {
    type: 'function',
    name: 'batchedDepositWithPermit',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'deposits',
        type: 'tuple[]',
        components: [
          { name: 'user', type: 'address' },
          { name: 'usd', type: 'uint64' },
          { name: 'deadline', type: 'uint64' },
          {
            name: 'signature',
            type: 'tuple',
            components: [
              { name: 'r', type: 'uint256' },
              { name: 's', type: 'uint256' },
              { name: 'v', type: 'uint8' },
            ],
          },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export interface HlDepositInput {
  user: Hex;
  /** USDC base units (6 decimals). */
  usd: bigint;
  /** Unix seconds. */
  deadline: bigint;
  signature: { r: bigint; s: bigint; v: number };
}

/** Submit a deposit-with-permit on behalf of the user. Returns the Arbitrum tx hash. */
export async function depositToHyperliquid(input: HlDepositInput): Promise<string> {
  const pk = process.env.BRIDGE_RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error('BRIDGE_RELAYER_PRIVATE_KEY not configured');
  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex);

  const client = createWalletClient({
    account,
    chain,
    transport: http(process.env.ARBITRUM_RPC_URL || undefined),
  });

  return client.writeContract({
    address: HL_BRIDGE_ADDRESS,
    abi: BRIDGE_ABI,
    functionName: 'batchedDepositWithPermit',
    args: [[{
      user: input.user,
      usd: input.usd,
      deadline: input.deadline,
      signature: { r: input.signature.r, s: input.signature.s, v: input.signature.v },
    }]],
  });
}
