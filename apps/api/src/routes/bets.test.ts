import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { betsRouter } from './bets';

// Mock Prisma
vi.mock('../db', () => ({
  prisma: {
    bet: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../db';

const app = express();
app.use(express.json());
app.use('/api/bets', betsRouter);

const VALID_WALLET = '3XsyYv8aF6uzX71AaaGdznSdLR679cv7mXzLCVAcxs1r';

describe('Bets API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/bets', () => {
    it('should return 400 when wallet not provided', async () => {
      const res = await request(app).get('/api/bets');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return empty list when no bets exist', async () => {
      vi.mocked(prisma.bet.findMany).mockResolvedValue([]);
      vi.mocked(prisma.bet.count).mockResolvedValue(0);

      const res = await request(app).get(`/api/bets?wallet=${VALID_WALLET}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it('should return user bets with pool info', async () => {
      const mockBet = {
        id: 'bet-uuid-1',
        poolId: 'pool-uuid-1',
        walletAddress: VALID_WALLET,
        side: 'UP' as const,
        amount: BigInt(100_000000),
        depositTx: 'tx-signature-123',
        claimed: false,
        claimTx: null,
        payoutAmount: null,
        createdAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        pool: {
          id: 'pool-uuid-1',
          poolId: 'btc-hourly-123',
          asset: 'BTC',
          status: 'ACTIVE' as const,
          startTime: new Date('2024-01-01T12:00:00Z'),
          endTime: new Date('2024-01-01T13:00:00Z'),
          strikePrice: BigInt(50000_000000),
          finalPrice: null,
          totalUp: BigInt(1000_000000),
          totalDown: BigInt(500_000000),
          winner: null,
        },
      };

      vi.mocked(prisma.bet.findMany).mockResolvedValue([mockBet]);
      vi.mocked(prisma.bet.count).mockResolvedValue(1);

      const res = await request(app).get(`/api/bets?wallet=${VALID_WALLET}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].side).toBe('UP');
      expect(res.body.data[0].amount).toBe('100000000');
      expect(res.body.data[0].pool.asset).toBe('BTC');
    });

    it('should show winner status when pool resolved', async () => {
      const mockBet = {
        id: 'bet-uuid-1',
        poolId: 'pool-uuid-1',
        walletAddress: VALID_WALLET,
        side: 'UP' as const,
        amount: BigInt(100_000000),
        depositTx: 'tx-signature-123',
        claimed: false,
        claimTx: null,
        payoutAmount: null,
        createdAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        pool: {
          id: 'pool-uuid-1',
          poolId: 'btc-hourly-123',
          asset: 'BTC',
          status: 'CLAIMABLE' as const,
          startTime: new Date('2024-01-01T12:00:00Z'),
          endTime: new Date('2024-01-01T13:00:00Z'),
          strikePrice: BigInt(50000_000000),
          finalPrice: BigInt(51000_000000),
          totalUp: BigInt(1000_000000),
          totalDown: BigInt(500_000000),
          winner: 'UP' as const,
        },
      };

      vi.mocked(prisma.bet.findMany).mockResolvedValue([mockBet]);
      vi.mocked(prisma.bet.count).mockResolvedValue(1);

      const res = await request(app).get(`/api/bets?wallet=${VALID_WALLET}`);

      expect(res.body.data[0].isWinner).toBe(true);
      expect(res.body.data[0].payoutAmount).toBe('150000000'); // 100/1000 * 1500
    });
  });

  describe('GET /api/bets/claimable', () => {
    it('should return 400 when wallet not provided', async () => {
      const res = await request(app).get('/api/bets/claimable');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return claimable bets summary', async () => {
      const mockBet = {
        id: 'bet-uuid-1',
        poolId: 'pool-uuid-1',
        walletAddress: VALID_WALLET,
        side: 'UP' as const,
        amount: BigInt(100_000000),
        depositTx: 'tx-signature-123',
        claimed: false,
        claimTx: null,
        payoutAmount: null,
        createdAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        pool: {
          id: 'pool-uuid-1',
          poolId: 'btc-hourly-123',
          asset: 'BTC',
          status: 'CLAIMABLE' as const,
          startTime: new Date('2024-01-01T12:00:00Z'),
          endTime: new Date('2024-01-01T13:00:00Z'),
          strikePrice: BigInt(50000_000000),
          finalPrice: BigInt(51000_000000),
          totalUp: BigInt(1000_000000),
          totalDown: BigInt(500_000000),
          winner: 'UP' as const,
        },
      };

      vi.mocked(prisma.bet.findMany).mockResolvedValue([mockBet]);

      const res = await request(app).get(`/api/bets/claimable?wallet=${VALID_WALLET}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bets).toHaveLength(1);
      expect(res.body.data.summary.count).toBe(1);
      expect(res.body.data.summary.totalClaimable).toBe('150000000');
    });

    it('should exclude losing bets from claimable', async () => {
      const losingBet = {
        id: 'bet-uuid-1',
        poolId: 'pool-uuid-1',
        walletAddress: VALID_WALLET,
        side: 'DOWN' as const, // Lost - pool went UP
        amount: BigInt(100_000000),
        depositTx: 'tx-signature-123',
        claimed: false,
        claimTx: null,
        payoutAmount: null,
        createdAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        pool: {
          id: 'pool-uuid-1',
          poolId: 'btc-hourly-123',
          asset: 'BTC',
          status: 'CLAIMABLE' as const,
          startTime: new Date('2024-01-01T12:00:00Z'),
          endTime: new Date('2024-01-01T13:00:00Z'),
          strikePrice: BigInt(50000_000000),
          finalPrice: BigInt(51000_000000),
          totalUp: BigInt(1000_000000),
          totalDown: BigInt(500_000000),
          winner: 'UP' as const,
        },
      };

      vi.mocked(prisma.bet.findMany).mockResolvedValue([losingBet]);

      const res = await request(app).get(`/api/bets/claimable?wallet=${VALID_WALLET}`);

      expect(res.body.data.bets).toHaveLength(0);
      expect(res.body.data.summary.count).toBe(0);
      expect(res.body.data.summary.totalClaimable).toBe('0');
    });
  });
});
