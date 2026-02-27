import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getSchedulerConfig, getSupportedAssets, isAssetSupported } from './config';

// Mock Prisma
const mockPrisma = {
  pool: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  priceSnapshot: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  eventLog: {
    create: vi.fn(),
  },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
  PoolStatus: {
    UPCOMING: 'UPCOMING',
    JOINING: 'JOINING',
    ACTIVE: 'ACTIVE',
    RESOLVED: 'RESOLVED',
    CLAIMABLE: 'CLAIMABLE',
  },
  Side: { UP: 'UP', DOWN: 'DOWN' },
  Prisma: {},
}));

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
      expect(config.templates).toHaveLength(12); // 3 assets x 4 intervals
      expect(config.templates[0].asset).toBe('BTC');
      expect(config.templates[0].intervalKey).toBe('1m');
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
      expect(assets).toContain('SOL');
      expect(assets).toHaveLength(3);
    });
  });

  describe('isAssetSupported', () => {
    it('should return true for supported assets', () => {
      expect(isAssetSupported('BTC')).toBe(true);
      expect(isAssetSupported('ETH')).toBe(true);
      expect(isAssetSupported('SOL')).toBe(true);
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

  describe('cleanupEmptyPools', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return 0 when no empty pools exist', async () => {
      mockPrisma.pool.findMany.mockResolvedValue([]);

      const { getScheduler } = await import('./pool-scheduler');
      const scheduler = getScheduler();
      const count = await scheduler.cleanupEmptyPools();

      expect(count).toBe(0);
      expect(mockPrisma.pool.findMany).toHaveBeenCalledOnce();
      expect(mockPrisma.priceSnapshot.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.pool.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete empty pools and their price snapshots', async () => {
      const emptyPools = [{ id: 'pool-1' }, { id: 'pool-2' }];
      mockPrisma.pool.findMany.mockResolvedValue(emptyPools);
      mockPrisma.priceSnapshot.deleteMany.mockResolvedValue({ count: 4 });
      mockPrisma.pool.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.eventLog.create.mockResolvedValue({});

      const { getScheduler } = await import('./pool-scheduler');
      const scheduler = getScheduler();
      const count = await scheduler.cleanupEmptyPools();

      expect(count).toBe(2);
      expect(mockPrisma.priceSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { poolId: { in: ['pool-1', 'pool-2'] } },
      });
      expect(mockPrisma.pool.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['pool-1', 'pool-2'] } },
      });
      expect(mockPrisma.eventLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'POOLS_CLEANUP',
          }),
        }),
      );
    });

    it('should query only RESOLVED and CLAIMABLE pools with zero totals', async () => {
      mockPrisma.pool.findMany.mockResolvedValue([]);

      const { getScheduler } = await import('./pool-scheduler');
      const scheduler = getScheduler();
      await scheduler.cleanupEmptyPools();

      const call = mockPrisma.pool.findMany.mock.calls[0][0];
      expect(call.where.status).toEqual({ in: ['RESOLVED', 'CLAIMABLE'] });
      expect(call.where.totalUp).toEqual(BigInt(0));
      expect(call.where.totalDown).toEqual(BigInt(0));
      expect(call.where.endTime.lt).toBeInstanceOf(Date);
      // Verify the safety buffer is roughly 1 hour ago
      const hourAgo = Date.now() - 60 * 60 * 1000;
      expect(call.where.endTime.lt.getTime()).toBeGreaterThanOrEqual(hourAgo - 1000);
      expect(call.where.endTime.lt.getTime()).toBeLessThanOrEqual(hourAgo + 1000);
    });

    it('should return 0 and not throw on database error', async () => {
      mockPrisma.pool.findMany.mockRejectedValue(new Error('DB connection lost'));

      const { getScheduler } = await import('./pool-scheduler');
      const scheduler = getScheduler();
      const count = await scheduler.cleanupEmptyPools();

      expect(count).toBe(0);
    });
  });
});
