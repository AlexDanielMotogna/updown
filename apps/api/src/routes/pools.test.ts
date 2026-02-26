import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { poolsRouter } from './pools';

// Mock Prisma
vi.mock('../db', () => ({
  prisma: {
    pool: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../db';

const app = express();
app.use(express.json());
app.use('/api/pools', poolsRouter);

describe('Pools API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/pools', () => {
    it('should return empty list when no pools exist', async () => {
      vi.mocked(prisma.pool.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pool.count).mockResolvedValue(0);

      const res = await request(app).get('/api/pools');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it('should return pools with pagination', async () => {
      const mockPool = {
        id: 'pool-uuid-1',
        poolId: 'btc-hourly-123',
        asset: 'BTC',
        status: 'JOINING' as const,
        startTime: new Date('2024-01-01T12:00:00Z'),
        endTime: new Date('2024-01-01T13:00:00Z'),
        lockTime: new Date('2024-01-01T12:50:00Z'),
        strikePrice: BigInt(50000_000000),
        finalPrice: null,
        totalUp: BigInt(1000_000000),
        totalDown: BigInt(500_000000),
        winner: null,
        createdAt: new Date('2024-01-01T11:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
      };

      vi.mocked(prisma.pool.findMany).mockResolvedValue([mockPool]);
      vi.mocked(prisma.pool.count).mockResolvedValue(1);

      const res = await request(app).get('/api/pools');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].asset).toBe('BTC');
      expect(res.body.data[0].strikePrice).toBe('50000000000');
      expect(res.body.data[0].totalUp).toBe('1000000000');
      expect(res.body.data[0].totalDown).toBe('500000000');
      expect(res.body.data[0].totalPool).toBe('1500000000');
    });

    it('should filter by asset', async () => {
      vi.mocked(prisma.pool.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pool.count).mockResolvedValue(0);

      await request(app).get('/api/pools?asset=btc');

      expect(prisma.pool.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { asset: 'BTC' },
        })
      );
    });

    it('should filter by status', async () => {
      vi.mocked(prisma.pool.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pool.count).mockResolvedValue(0);

      await request(app).get('/api/pools?status=ACTIVE');

      expect(prisma.pool.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE' },
        })
      );
    });

    it('should respect pagination parameters', async () => {
      vi.mocked(prisma.pool.findMany).mockResolvedValue([]);
      vi.mocked(prisma.pool.count).mockResolvedValue(100);

      const res = await request(app).get('/api/pools?page=3&limit=10');

      expect(prisma.pool.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
      expect(res.body.meta.page).toBe(3);
      expect(res.body.meta.limit).toBe(10);
      expect(res.body.meta.totalPages).toBe(10);
    });
  });

  describe('GET /api/pools/:id', () => {
    it('should return 404 when pool not found', async () => {
      vi.mocked(prisma.pool.findFirst).mockResolvedValue(null);

      const res = await request(app).get('/api/pools/nonexistent-id');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('POOL_NOT_FOUND');
    });

    it('should return pool with details and odds', async () => {
      const mockPool = {
        id: 'pool-uuid-1',
        poolId: 'btc-hourly-123',
        asset: 'BTC',
        status: 'ACTIVE' as const,
        startTime: new Date('2024-01-01T12:00:00Z'),
        endTime: new Date('2024-01-01T13:00:00Z'),
        lockTime: new Date('2024-01-01T12:50:00Z'),
        strikePrice: BigInt(50000_000000),
        finalPrice: null,
        totalUp: BigInt(1000_000000),
        totalDown: BigInt(500_000000),
        winner: null,
        createdAt: new Date('2024-01-01T11:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        priceSnapshots: [
          {
            id: 'snap-1',
            poolId: 'pool-uuid-1',
            type: 'STRIKE',
            price: BigInt(50000_000000),
            timestamp: new Date('2024-01-01T12:00:00Z'),
            source: 'pacifica',
            rawHash: 'abc123',
            createdAt: new Date(),
          },
        ],
        _count: { bets: 15 },
      };

      vi.mocked(prisma.pool.findFirst).mockResolvedValue(mockPool);

      const res = await request(app).get('/api/pools/pool-uuid-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.asset).toBe('BTC');
      expect(res.body.data.betCount).toBe(15);
      expect(res.body.data.odds).toBeDefined();
      expect(res.body.data.odds.up).toBe('1.50'); // 500/1000 + 1
      expect(res.body.data.odds.down).toBe('3.00'); // 1000/500 + 1
      expect(res.body.data.priceSnapshots).toHaveLength(1);
    });
  });
});
