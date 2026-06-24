/**
 * bridge-core — the framework-agnostic contract for cross-chain funding
 * (bridge native USDC Solana → EVM into the terminal's EVM wallet).
 *
 * The app/UI depends only on this contract; concrete rails live in sibling
 * packages (bridge-lifi first, bridge-cctp later) and self-register with
 * BridgeProvider. See docs/Terminal-Migration/ADR-004-cross-chain-funding-bridge.
 */
export * from './types';
export * from './bridge-adapter';
export * from './registry';
