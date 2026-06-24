import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeProvider } from './registry';
import type { BridgeAdapter } from './bridge-adapter';
import type { BridgeName } from './types';

function fakeAdapter(name: BridgeName): BridgeAdapter {
  return {
    name,
    quote: vi.fn(),
    buildSourceTx: vi.fn(),
    submit: vi.fn(),
    getStatus: vi.fn(),
  } as unknown as BridgeAdapter;
}

describe('BridgeProvider', () => {
  beforeEach(() => {
    BridgeProvider.configure({ defaultProvider: undefined });
    BridgeProvider.clearCache();
  });

  it('throws for an unregistered bridge', () => {
    expect(() => BridgeProvider.get('cctp')).toThrow(/not registered/);
  });

  it('throws when no name and no default is configured', () => {
    expect(() => BridgeProvider.get()).toThrow(/no name given/);
  });

  it('resolves and memoizes an adapter by name', () => {
    let calls = 0;
    BridgeProvider.register('lifi', () => { calls++; return fakeAdapter('lifi'); });

    const a1 = BridgeProvider.get('lifi');
    const a2 = BridgeProvider.get('lifi');
    expect(a1).toBe(a2);
    expect(calls).toBe(1); // factory ran once (memoized)
    expect(a1.name).toBe('lifi');
  });

  it('get() with no name uses the configured defaultProvider', () => {
    BridgeProvider.register('lifi', () => fakeAdapter('lifi'));
    BridgeProvider.configure({ defaultProvider: 'lifi' });

    expect(BridgeProvider.get().name).toBe('lifi');
  });

  it('has() and list() reflect registrations', () => {
    BridgeProvider.register('lifi', () => fakeAdapter('lifi'));
    expect(BridgeProvider.has('lifi')).toBe(true);
    expect(BridgeProvider.has('cctp')).toBe(false);
    expect(BridgeProvider.list()).toContain('lifi');
  });
});
