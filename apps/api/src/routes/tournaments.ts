import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import {
  getTournamentBracket,
  getActiveBanner,
} from '../services/tournament';
import { serializeBigInt } from './tournament-helpers';
import { tournamentActionRouter } from './tournament-actions';

export const tournamentRouter: RouterType = Router();

// Mount action routes (POST endpoints) on the same router
tournamentRouter.use('/', tournamentActionRouter);

// Re-export helpers so any code that imported from here still works
export { serializeBigInt, requireAdmin } from './tournament-helpers';

// ─── Public GET endpoints ───────────────────────────────────────────

// GET / — list tournaments with optional status filter
const listFilterSchema = z.object({
  status: z.string().optional(),
  type: z.enum(['CRYPTO', 'SPORTS']).optional(),
});

tournamentRouter.get('/', async (req, res) => {
  try {
    const parsed = listFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.flatten() },
      });
    }

    const { status, type } = parsed.data;
    const where: any = {};
    if (status) {
      where.status = status.toUpperCase();
    }
    if (type) {
      where.tournamentType = type;
    }

    const tournaments = await prisma.tournament.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { participants: true } },
        participants: { select: { walletAddress: true } },
      },
    });

    res.json({
      success: true,
      data: tournaments.map(t => serializeBigInt({
        ...t,
        participantCount: t._count.participants,
        participantWallets: t.participants.map(p => p.walletAddress),
        participants: undefined,
        _count: undefined,
      })),
    });
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch tournaments' },
    });
  }
});

// GET /active-banner — first REGISTERING tournament for home page banner
tournamentRouter.get('/active-banner', async (_req, res) => {
  try {
    const banner = await getActiveBanner();
    res.json({ success: true, data: banner ? serializeBigInt(banner) : null });
  } catch (error) {
    console.error('Error fetching active banner:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch active banner' },
    });
  }
});

// GET /my-prizes — get tournaments won by a wallet (claimed and unclaimed)
tournamentRouter.get('/my-prizes', async (req, res) => {
  try {
    const wallet = req.query.wallet as string;
    if (!wallet) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_WALLET', message: 'wallet query param required' } });
    }

    const won = await prisma.tournament.findMany({
      where: { winnerWallet: wallet, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });

    res.json({
      success: true,
      data: won.map(t => serializeBigInt({
        id: t.id,
        name: t.name,
        asset: t.asset,
        prizePool: t.prizePool,
        prizeClaimedTx: t.prizeClaimedTx,
        completedAt: t.completedAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching prizes:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch prizes' } });
  }
});

// GET /:id — tournament detail with participant count and current matches
tournamentRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        _count: { select: { participants: true } },
        matches: {
          where: { status: 'ACTIVE' },
          orderBy: { round: 'asc' },
        },
      },
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: { code: 'TOURNAMENT_NOT_FOUND', message: `Tournament with ID ${id} does not exist` },
      });
    }

    res.json({
      success: true,
      data: serializeBigInt({
        ...tournament,
        participantCount: tournament._count.participants,
        _count: undefined,
      }),
    });
  } catch (error) {
    console.error('Error fetching tournament:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch tournament' },
    });
  }
});

// GET /:id/bracket — full bracket data for bracket visualization
tournamentRouter.get('/:id/bracket', async (req, res) => {
  try {
    const { id } = req.params;
    const wallet = req.query.wallet as string | undefined;
    const bracket = await getTournamentBracket(id);

    if (!bracket) {
      return res.status(404).json({
        success: false,
        error: { code: 'TOURNAMENT_NOT_FOUND', message: `Tournament with ID ${id} does not exist` },
      });
    }

    // Hide opponent predictions only during PENDING (prediction window open)
    for (const roundMatches of Object.values(bracket.rounds)) {
      for (const match of roundMatches) {
        if (match.status !== 'PENDING') continue;

        const isP1 = wallet && match.player1Wallet === wallet;
        const isP2 = wallet && match.player2Wallet === wallet;

        if (isP1) {
          // Hide player2's prediction
          (match as any).player2Prediction = null;
          (match as any).player2PredictedAt = null;
        } else if (isP2) {
          // Hide player1's prediction
          (match as any).player1Prediction = null;
          (match as any).player1PredictedAt = null;
        } else {
          // Spectator — hide both
          (match as any).player1Prediction = null;
          (match as any).player2Prediction = null;
          (match as any).player1PredictedAt = null;
          (match as any).player2PredictedAt = null;
        }
      }
    }

    res.json({ success: true, data: serializeBigInt(bracket) });
  } catch (error) {
    console.error('Error fetching bracket:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch bracket' },
    });
  }
});
