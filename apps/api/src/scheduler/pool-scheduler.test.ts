import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getSchedulerConfig, getSupportedAssets, isAssetSupported } from './config';

// Mock environment
vi.mock('market-data', () => ({
  PacificaProvider: vi.fn().mockImplementation(() => ({
    isHealthy: vi.fn().mockResolvedValue(true),
    getSpotPrice: vi.fn().mockResolvedValue({
      symbol: 'BTC',
      price: BigInt(50000_000_000), // $50,000 with 6 decimals
      timestamp: new Date(),
      source: 'pacifica',
      rawHash: 'abc123',
    }),
  })),
}));

describe('Scheduler Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getSchedulerConfig', () => {
    it('should return default config when no env vars set', () => {
      const config = getSchedulerConfig();

      expect(config.enabled).toBe(true);
      expect(config.priceSource).toBe('pacifica');
      expect(config.templates).toHaveLength(2);
      expect(config.templates[0].asset).toBe('BTC');
      expect(config.templates[1].asset).toBe('ETH');
    });

    it('should disable scheduler when SCHEDULER_ENABLED=false', () => {
      process.env.SCHEDULER_ENABLED = 'false';
      const config = getSchedulerConfig();

      expect(config.enabled).toBe(false);
    });

    it('should use custom templates from env', () => {
      process.env.POOL_TEMPLATES = JSON.stringify([
        {
          asset: 'SOL',
          interval: 1800,
          cronExpression: '0,30 * * * *',
          joinWindowSeconds: 1500,
        },
      ]);

      const config = getSchedulerConfig();

      expect(config.templates).toHaveLength(1);
      expect(config.templates[0].asset).toBe('SOL');
      expect(config.templates[0].interval).toBe(1800);
    });
  });

  describe('getSupportedAssets', () => {
    it('should return unique assets from templates', () => {
      const assets = getSupportedAssets();

      expect(assets).toContain('BTC');
      expect(assets).toContain('ETH');
      expect(assets).toHaveLength(2);
    });
  });

  describe('isAssetSupported', () => {
    it('should return true for supported assets', () => {
      expect(isAssetSupported('BTC')).toBe(true);
      expect(isAssetSupported('ETH')).toBe(true);
    });

    it('should return false for unsupported assets', () => {
      expect(isAssetSupported('DOGE')).toBe(false);
      expect(isAssetSupported('XRP')).toBe(false);
    });
  });
});

describe('PoolScheduler', () => {
  describe('getStatus', () => {
    it('should return initial status when not started', async () => {
      // Import dynamically to get fresh instance
      const { getScheduler } = await import('./pool-scheduler');
      const scheduler = getScheduler();

      const status = scheduler.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.jobCount).toBe(0);
      expect(status.authority).toBeDefined();
    });
  });
});
