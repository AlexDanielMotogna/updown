import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import {
  createTournament,
  registerParticipant,
  startTournament,
  cancelTournament,
  getTournamentBracket,
  getActiveBanner,
  submitPrediction,
} from '../services/tournament';

export const tournamentRouter: RouterType = Router();

// BigInt can't be JSON.stringify'd — convert to string
function serializeBigInt(data: unknown) {
  return JSON.parse(JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

// ─── Admin auth helper ───────────────────────────────────────────────
function requireAdmin(req: any, res: any): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'Admin not configured' } });
    return false;
  }
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== adminKey) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return false;
  }
  return true;
}

// ─── Public endpoints ────────────────────────────────────────────────

// GET / — list tournaments with optional status filter
const listFilterSchema = z.object({
  status: z.string().optional(),
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

    const { status } = parsed.data;
    const where: any = {};
    if (status) {
      where.status = status.toUpperCase();
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

// POST /:id/prepare-register — returns accounts for building the USDC transfer tx
tournamentRouter.post('/:id/prepare-register', async (req, res) => {
  try {
    const { id } = req.params;
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_WALLET', message: 'walletAddress required' } });
    }

    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tournament not found' } });
    }
    if (tournament.status !== 'REGISTERING') {
      return res.status(400).json({ success: false, error: { code: 'NOT_REGISTERING', message: 'Tournament is not accepting registrations' } });
    }

    const existing = await prisma.tournamentParticipant.findUnique({
      where: { tournamentId_walletAddress: { tournamentId: id, walletAddress } },
    });
    if (existing) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_REGISTERED', message: 'Already registered' } });
    }

    const { getAuthorityKeypair, getUsdcMint } = await import('../utils/solana');
    const { getAssociatedTokenAddress } = await import('@solana/spl-token');

    const authority = getAuthorityKeypair();
    const usdcMint = getUsdcMint();
    const authorityTokenAccount = await getAssociatedTokenAddress(usdcMint, authority.publicKey);
    const userTokenAccount = await getAssociatedTokenAddress(usdcMint, new (await import('@solana/web3.js')).PublicKey(walletAddress));

    res.json({
      success: true,
      data: {
        entryFee: tournament.entryFee.toString(),
        accounts: {
          authorityTokenAccount: authorityTokenAccount.toBase58(),
          userTokenAccount: userTokenAccount.toBase58(),
          usdcMint: usdcMint.toBase58(),
        },
      },
    });
  } catch (error) {
    console.error('Error preparing registration:', error);
    res.status(500).json({ success: false, error: { code: 'PREPARE_ERROR', message: 'Failed to prepare registration' } });
  }
});

// POST /:id/register — register for a tournament (after USDC transfer)
const registerSchema = z.object({
  walletAddress: z.string().min(1),
  depositTx: z.string().min(1),
});

tournamentRouter.post('/:id/register', async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() },
      });
    }

    const { walletAddress, depositTx } = parsed.data;
    const participant = await registerParticipant(id, walletAddress, depositTx);

    res.status(201).json({ success: true, data: serializeBigInt(participant) });
  } catch (error) {
    console.error('Error registering for tournament:', error);
    const message = error instanceof Error ? error.message : 'Failed to register';
    res.status(400).json({
      success: false,
      error: { code: 'REGISTRATION_ERROR', message },
    });
  }
});

// POST /:id/matches/:matchId/predict — submit price prediction
const predictSchema = z.object({
  walletAddress: z.string().min(1),
  prediction: z.number().positive(),
});

tournamentRouter.post('/:id/matches/:matchId/predict', async (req, res) => {
  try {
    const { matchId } = req.params;
    const parsed = predictSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() },
      });
    }

    const { walletAddress, prediction } = parsed.data;
    const predictionBigInt = BigInt(Math.round(prediction * 1_000_000));

    const result = await submitPrediction(matchId, walletAddress, predictionBigInt);

    res.json({
      success: true,
      data: {
        started: result.started,
        match: serializeBigInt(result.match),
      },
    });
  } catch (error) {
    console.error('Error submitting prediction:', error);
    const message = error instanceof Error ? error.message : 'Failed to submit prediction';
    res.status(400).json({
      success: false,
      error: { code: 'PREDICTION_ERROR', message },
    });
  }
});

// POST /:id/claim-prize — winner claims their USDC prize
tournamentRouter.post('/:id/claim-prize', async (req, res) => {
  try {
    const { id } = req.params;
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_WALLET', message: 'walletAddress required' } });
    }

    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tournament not found' } });
    }
    if (tournament.status !== 'COMPLETED') {
      return res.status(400).json({ success: false, error: { code: 'NOT_COMPLETED', message: 'Tournament is not completed' } });
    }
    if (tournament.winnerWallet !== walletAddress) {
      return res.status(403).json({ success: false, error: { code: 'NOT_WINNER', message: 'Only the winner can claim the prize' } });
    }
    if (tournament.prizeClaimedTx) {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_CLAIMED', message: 'Prize already claimed' } });
    }

    // Calculate prize (after 5% platform fee)
    const prizePool = tournament.prizePool;
    const feeAmount = (prizePool * BigInt(500)) / BigInt(10000);
    const prizeAmount = prizePool - feeAmount;

    // Transfer USDC from authority to winner
    const { getAuthorityKeypair, getUsdcMint, getConnection } = await import('../utils/solana');
    const { getAssociatedTokenAddress, createTransferInstruction, getAccount } = await import('@solana/spl-token');
    const { PublicKey, Transaction } = await import('@solana/web3.js');

    const authority = getAuthorityKeypair();
    const usdcMint = getUsdcMint();
    const connection = getConnection();

    const authorityAta = await getAssociatedTokenAddress(usdcMint, authority.publicKey);
    const winnerPubkey = new PublicKey(walletAddress);
    const winnerAta = await getAssociatedTokenAddress(usdcMint, winnerPubkey);

    // Check authority has enough balance
    const authorityAccount = await getAccount(connection, authorityAta);
    if (authorityAccount.amount < BigInt(prizeAmount)) {
      return res.status(500).json({ success: false, error: { code: 'INSUFFICIENT_BALANCE', message: 'Authority wallet has insufficient USDC balance' } });
    }

    const ix = createTransferInstruction(authorityAta, winnerAta, authority.publicKey, BigInt(prizeAmount));
    const tx = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = authority.publicKey;
    tx.sign(authority);

    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    // Mark as claimed
    await prisma.tournament.update({
      where: { id },
      data: { prizeClaimedTx: signature },
    });

    console.log(`[Tournament] Prize claimed: ${walletAddress} received ${prizeAmount} USDC (tx: ${signature})`);

    res.json({
      success: true,
      data: {
        prizeAmount: prizeAmount.toString(),
        feeAmount: feeAmount.toString(),
        txSignature: signature,
      },
    });
  } catch (error) {
    console.error('Error claiming prize:', error);
    const message = error instanceof Error ? error.message : 'Failed to claim prize';
    res.status(500).json({ success: false, error: { code: 'CLAIM_ERROR', message } });
  }
});

// ─── Admin endpoints ─────────────────────────────────────────────────

// POST /admin/create — create a tournament
const createTournamentSchema = z.object({
  name: z.string().min(1),
  asset: z.string().min(1),
  entryFee: z.number().min(0),
  size: z.number().int().min(2),
  matchDuration: z.number().int().min(1),
});

tournamentRouter.post('/admin/create', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const parsed = createTournamentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() },
      });
    }

    const tournament = await createTournament({
      ...parsed.data,
      entryFee: BigInt(parsed.data.entryFee),
    });
    res.status(201).json({ success: true, data: serializeBigInt(tournament) });
  } catch (error) {
    console.error('Error creating tournament:', error);
    const message = error instanceof Error ? error.message : 'Failed to create tournament';
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_ERROR', message },
    });
  }
});

// POST /admin/:id/start — start a tournament
tournamentRouter.post('/admin/:id/start', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { id } = req.params;
    const matches = await startTournament(id);
    res.json({ success: true, data: serializeBigInt({ matches }) });
  } catch (error) {
    console.error('Error starting tournament:', error);
    const message = error instanceof Error ? error.message : 'Failed to start tournament';
    res.status(400).json({
      success: false,
      error: { code: 'START_ERROR', message },
    });
  }
});

// POST /admin/:id/cancel — cancel a tournament
tournamentRouter.post('/admin/:id/cancel', async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const { id } = req.params;
    const result = await cancelTournament(id);
    res.json({ success: true, data: serializeBigInt(result) });
  } catch (error) {
    console.error('Error cancelling tournament:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel tournament';
    res.status(400).json({
      success: false,
      error: { code: 'CANCEL_ERROR', message },
    });
  }
});
