import type { BridgeAdapter } from './types';

/**
 * Provider-agnostic registry: the API/UI ask for a provider by name and get an
 * adapter, so changing the bridge rail is a one-line config (mirrors
 * exchange-core's ExchangeProvider registry).
 */
const factories = new Map<string, () => BridgeAdapter>();

export function registerBridgeProvider(name: string, factory: () => BridgeAdapter): void {
  factories.set(name, factory);
}

export function getBridgeAdapter(name: string): BridgeAdapter {
  const factory = factories.get(name);
  if (!factory) throw new Error(`No bridge provider registered for "${name}"`);
  return factory();
}

export function listBridgeProviders(): string[] {
  return [...factories.keys()];
}
