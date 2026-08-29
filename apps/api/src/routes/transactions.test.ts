import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { transactionsRouter } from './transactions';

// Mock Prisma
vi.mock('../db', () => ({
  prisma: {
    pool: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    bet: {
      findUnique: vi.fn(),
      // Idempotency lookup in confirm-deposit (by tx signature).
      findFirst: vi.fn().mockResolvedValue(null),
      // getDistinctBettorWallets (utils/bets.ts) — participant count for the
      // fee waiver and the payout preview.
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      // Conditional claim write in confirm-claim.
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn(),
    },
    // resolveFeeBps (utils/payout.ts) reads the user's level; confirm-claim
    // credits totalWon.
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    eventLog: {
      create: vi.fn(),
    },
  },
}));

// Mock Solana connection
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js');
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getTransaction: vi.fn().mockResolvedValue({
        meta: { err: null, logMessages: [] },
      }),
      getAccountInfo: vi.fn().mockResolvedValue(null),
      // prepare-claim builds a transaction, so it needs a blockhash.
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 1,
      }),
    })),
  };
});

import { prisma } from '../db';

const app = express();
app.use(express.json());
app.use('/api/transactions', transactionsRouter);

const VALID_WALLET = '3XsyYv8aF6uzX71AaaGdznSdLR679cv7mXzLCVAcxs1r';
const VALID_TX_SIG = '5UfDuX7WXKtCpHMsNc2FMnuLMSxJz1YNxrRNYdGYk7r8g4ZhKzJWDFP3FzGjX9UhXzQKvKJZDjBzX1234567890';
const VALID_POOL_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_BET_ID = '660e8400-e29b-41d4-a716-446655440001';

const SPORTS_FIELDS = {
  totalDraw: BigInt(0),
  numSides: 2,
  poolType: 'CRYPTO' as const,
  matchId: null,
  homeTeam: null,
  awayTeam: null,
  homeTeamCrest: null,
  awayTeamCrest: null,
  league: null,
  matchAnalysis: null,
  homeScore: null,
  awayScore: null,
};

describe('Transactions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/transactions/deposit', () => {
    const mockPool = {
      id: VALID_POOL_ID,
      poolId: 'btc-hourly-123',
      asset: 'BTC',
      interval: '1h',
      durationSeconds: 3600,
      status: 'JOINING' as const,
      startTime: new Date(Date.now() + 3600000),
      endTime: new Date(Date.now() + 7200000),
      lockTime: new Date(Date.now() + 3000000),
      strikePrice: null,
      finalPrice: null,
      totalUp: BigInt(0),
      totalDown: BigInt(0),
      ...SPORTS_FIELDS,
      winner: null,
      squadId: null,
      maxBettors: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return 400 for invalid request body', async () => {
      const res = await request(app)
        .post('/api/transactions/deposit')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent pool', async () => {
      vi.mocked(prisma.pool.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/transactions/deposit')
        .send({
          poolId: VALID_POOL_ID,
          walletAddress: VALID_WALLET,
          side: 'UP',
          amount: 100_000000,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('POOL_NOT_FOUND');
    });

    it('should return 400 if pool is not in JOINING status', async () => {
      vi.mocked(prisma.pool.findUnique).mockResolvedValue({
        ...mockPool,
        status: 'ACTIVE',
      });

      const res = await request(app)
        .post('/api/transactions/deposit')
        .send({
          poolId: VALID_POOL_ID,
          walletAddress: VALID_WALLET,
          side: 'UP',
          amount: 100_000000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_POOL_STATUS');
    });

    // The old "should return 400 if user already has a bet" case was deleted,
    // not repaired: betting BOTH sides is deliberately allowed now (one Bet row
    // per pool+wallet+side, see the "Both-sides allowed: no side-lock" note in
    // deposits.ts), so BET_EXISTS no longer exists anywhere in the route.

    it('should return account addresses for valid deposit request', async () => {
      vi.mocked(prisma.pool.findUnique).mockResolvedValue(mockPool);
      vi.mocked(prisma.bet.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/transactions/deposit')
        .send({
          poolId: VALID_POOL_ID,
          walletAddress: VALID_WALLET,
          side: 'UP',
          amount: 100_000000,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accounts).toBeDefined();
      expect(res.body.data.accounts.pool).toBeDefined();
      expect(res.body.data.accounts.vault).toBeDefined();
      expect(res.body.data.accounts.userBet).toBeDefined();
      expect(res.body.data.programId).toBeDefined();
    });
  });

  describe('POST /api/transactions/confirm-deposit', () => {
    const mockPool = {
      id: VALID_POOL_ID,
      poolId: 'btc-hourly-123',
      asset: 'BTC',
      interval: '1h',
      durationSeconds: 3600,
      status: 'JOINING' as const,
      startTime: new Date(),
      endTime: new Date(),
      lockTime: new Date(),
      strikePrice: null,
      finalPrice: null,
      totalUp: BigInt(0),
      totalDown: BigInt(0),
      ...SPORTS_FIELDS,
      winner: null,
      squadId: null,
      maxBettors: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return 400 for invalid request body', async () => {
      const res = await request(app)
        .post('/api/transactions/confirm-deposit')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent pool', async () => {
      vi.mocked(prisma.pool.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/transactions/confirm-deposit')
        .send({
          poolId: VALID_POOL_ID,
          walletAddress: VALID_WALLET,
          txSignature: VALID_TX_SIG,
          side: 'UP',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('POOL_NOT_FOUND');
    });

    it('should return success if bet already exists with same tx', async () => {
      vi.mocked(prisma.pool.findUnique).mockResolvedValue(mockPool);
      // findFirst, not findUnique: the route keys idempotency off the tx
      // signature (poolId + wallet + depositTx), which is not a unique index.
      vi.mocked(prisma.bet.findFirst).mockResolvedValue({
        id: VALID_BET_ID,
        poolId: VALID_POOL_ID,
        walletAddress: VALID_WALLET,
        side: 'UP',
        amount: BigInt(100_000000),
        depositTx: VALID_TX_SIG,
        claimed: false,
        claimTx: null,
        payoutAmount: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/transactions/confirm-deposit')
        .send({
          poolId: VALID_POOL_ID,
          walletAddress: VALID_WALLET,
          txSignature: VALID_TX_SIG,
          side: 'UP',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('already_confirmed');
    });
  });

  describe('POST /api/transactions/claim', () => {
    const mockPool = {
      id: VALID_POOL_ID,
      poolId: 'btc-hourly-123',
      asset: 'BTC',
      interval: '1h',
      durationSeconds: 3600,
      status: 'CLAIMABLE' as const,
      startTime: new Date(),
      endTime: new Date(),
      lockTime: new Date(),
      strikePrice: BigInt(50000_000000),
      finalPrice: BigInt(51000_000000),
      totalUp: BigInt(1000_000000),
      totalDown: BigInt(500_000000),
      ...SPORTS_FIELDS,
      winner: 'UP' as const,
      squadId: null,
      maxBettors: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return 400 for invalid request body', async () => {
      const res = await request(app)
        .post('/api/transactions/claim')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent pool', async () => {
      vi.mocked(prisma.pool.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/transactions/claim')
        .send({
          poolId: VALID_POOL_ID,
          walletAddress: VALID_WALLET,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('POOL_NOT_FOUND');
    });

    // This used to be two cases: "no bet at all" expecting 404 BET_NOT_FOUND,
    // and "bet on the losing side" expecting 400 NOT_WINNER. They are the SAME
    // path now — the route looks the bet up by the compound key with
    // `side: pool.winner`, so a wallet holding only a losing-side bet finds no
    // row and is simply not a winner. One scenario, one code.
    it('returns NOT_WINNER when the wallet has no bet on the winning side', async () => {
      vi.mocked(prisma.pool.findUnique).mockResolvedValue(mockPool);
      vi.mocked(prisma.bet.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/transactions/claim')
        .send({
          poolId: VALID_POOL_ID,
          walletAddress: VALID_WALLET,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NOT_WINNER');
    });

    it('should return 400 if already claimed', async () => {
      vi.mocked(prisma.pool.findUnique).mockResolvedValue(mockPool);
      vi.mocked(prisma.bet.findUnique).mockResolvedValue({
        id: VALID_BET_ID,
        poolId: VALID_POOL_ID,
        walletAddress: VALID_WALLET,
        side: 'UP',
        amount: BigInt(100_000000),
        depositTx: 'tx123',
        claimed: true,
        claimTx: 'claim-tx-123',
        payoutAmount: BigInt(150_000000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/transactions/claim')
        .send({
          poolId: VALID_POOL_ID,
          walletAddress: VALID_WALLET,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ALREADY_CLAIMED');
    });

    it('returns a partially-signed claim transaction for a winning bet', async () => {
      vi.mocked(prisma.pool.findUnique).mockResolvedValue(mockPool);
      vi.mocked(prisma.bet.findUnique).mockResolvedValue({
        id: VALID_BET_ID,
        poolId: VALID_POOL_ID,
        walletAddress: VALID_WALLET,
        side: 'UP',
        amount: BigInt(100_000000),
        depositTx: 'tx123',
        claimed: false,
        claimTx: null,
        payoutAmount: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(prisma.bet.count).mockResolvedValue(3);
      // Three distinct participants, so the single-bettor fee waiver does not
      // kick in and the payout preview is computed normally.
      vi.mocked(prisma.bet.findMany).mockResolvedValue([
        { walletAddress: VALID_WALLET },
        { walletAddress: 'D1oGyLcVJHNVpapVvB6JHcHzYNJRqLbfKQmTMwLLcCyk' },
        { walletAddress: 'BPFLoaderUpgradeab1e11111111111111111111111' },
      ] as never);

      const res = await request(app)
        .post('/api/transactions/claim')
        .send({
          poolId: VALID_POOL_ID,
          walletAddress: VALID_WALLET,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // `data.accounts` is gone: the route no longer hands back raw account
      // addresses for the client to assemble. It returns a transaction already
      // co-signed by the authority (that co-signature is what enforces the fee),
      // which the frontend just co-signs and sends.
      expect(res.body.data.transaction).toBeDefined();
      expect(res.body.data.bet.expectedPayout).toBeDefined();
    });
  });

  describe('POST /api/transactions/confirm-claim', () => {
    it('should return 400 for invalid request body', async () => {
      const res = await request(app)
        .post('/api/transactions/confirm-claim')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent bet', async () => {
      vi.mocked(prisma.bet.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/transactions/confirm-claim')
        .send({
          betId: VALID_BET_ID,
          txSignature: VALID_TX_SIG,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BET_NOT_FOUND');
    });
  });
});
