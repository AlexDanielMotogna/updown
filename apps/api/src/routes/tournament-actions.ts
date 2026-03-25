import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import {
  createTournament,
  registerParticipant,
  startTournament,
  cancelTournament,
  submitPrediction,
} from '../services/tournament';
import { serializeBigInt, requireAdmin } from './tournament-helpers';

export const tournamentActionRouter: RouterType = Router();

// ─── Public action endpoints ────────────────────────────────────────

// POST /:id/prepare-register — returns accounts for building the USDC transfer tx
tournamentActionRouter.post('/:id/prepare-register', async (req, res) => {
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

    const { getAuthorityKeypair, getUsdcMint, deriveTournamentSeed } = await import('../utils/solana');
    const { getAssociatedTokenAddress } = await import('@solana/spl-token');
    const { PublicKey } = await import('@solana/web3.js');
    const { getTournamentPDA, getTournamentVaultPDA, getTournamentParticipantPDA, PROGRAM_ID } = await import('solana-client');

    const authority = getAuthorityKeypair();
    const usdcMint = getUsdcMint();
    const userPubkey = new PublicKey(walletAddress);
    const userTokenAccount = await getAssociatedTokenAddress(usdcMint, userPubkey);

    // If tournament has on-chain PDA, return PDA accounts for program instruction
    if (tournament.onChainPda) {
      const tournamentPda = new PublicKey(tournament.onChainPda);
      const vaultPda = new PublicKey(tournament.onChainVault!);
      const [participantPda] = getTournamentParticipantPDA(tournamentPda, userPubkey);

      res.json({
        success: true,
        data: {
          entryFee: tournament.entryFee.toString(),
          asset: tournament.asset,
          name: tournament.name,
          usePda: true,
          accounts: {
            tournamentPda: tournamentPda.toBase58(),
            vaultPda: vaultPda.toBase58(),
            participantPda: participantPda.toBase58(),
            userTokenAccount: userTokenAccount.toBase58(),
            usdcMint: usdcMint.toBase58(),
            programId: PROGRAM_ID.toBase58(),
          },
        },
      });
    } else {
      // Legacy: direct transfer to authority ATA
      const authorityTokenAccount = await getAssociatedTokenAddress(usdcMint, authority.publicKey);

      res.json({
        success: true,
        data: {
          entryFee: tournament.entryFee.toString(),
          asset: tournament.asset,
          name: tournament.name,
          usePda: false,
          accounts: {
            authorityTokenAccount: authorityTokenAccount.toBase58(),
            userTokenAccount: userTokenAccount.toBase58(),
            usdcMint: usdcMint.toBase58(),
          },
        },
      });
    }
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

tournamentActionRouter.post('/:id/register', async (req, res) => {
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

// POST /:id/matches/:matchId/predict — submit prediction (crypto: price, sports: matchday)
const predictSchema = z.object({
  walletAddress: z.string().min(1),
  prediction: z.number().positive().optional(),
  outcomes: z.array(z.string()).optional(),
  totalGoals: z.number().int().min(0).optional(),
});

tournamentActionRouter.post('/:id/matches/:matchId/predict', async (req, res) => {
  try {
    const { matchId } = req.params;
    const parsed = predictSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details: parsed.error.flatten() },
      });
    }

    const { walletAddress, prediction, outcomes, totalGoals } = parsed.data;
    let predictionStr: string;
    let totalGoalsVal: number | undefined;

    if (outcomes && outcomes.length > 0) {
      predictionStr = JSON.stringify({ outcomes, totalGoals: totalGoals ?? 0 });
      totalGoalsVal = totalGoals;
    } else if (prediction) {
      predictionStr = BigInt(Math.round(prediction * 1_000_000)).toString();
    } else {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Either prediction or outcomes required' } });
    }

    const result = await submitPrediction(matchId, walletAddress, predictionStr, totalGoalsVal);

    res.json({
      success: true,
      data: { started: result.started, match: serializeBigInt(result.match) },
    });
  } catch (error) {
    console.error('Error submitting prediction:', error);
    const message = error instanceof Error ? error.message : 'Failed to submit prediction';
    res.status(400).json({ success: false, error: { code: 'PREDICTION_ERROR', message } });
  }
});

// POST /:id/claim-prize — winner claims their USDC prize
tournamentActionRouter.post('/:id/claim-prize', async (req, res) => {
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

    const prizePool = tournament.prizePool;
    const feeAmount = (prizePool * BigInt(500)) / BigInt(10000);
    const prizeAmount = prizePool - feeAmount;

    const { getAuthorityKeypair, getUsdcMint, getConnection } = await import('../utils/solana');
    const { getAssociatedTokenAddress, createTransferInstruction, getAccount } = await import('@solana/spl-token');
    const { PublicKey, Transaction } = await import('@solana/web3.js');

    const authority = getAuthorityKeypair();
    const usdcMint = getUsdcMint();
    const connection = getConnection();
    const winnerPubkey = new PublicKey(walletAddress);
    const winnerAta = await getAssociatedTokenAddress(usdcMint, winnerPubkey);

    let signature: string;

    if (tournament.onChainPda) {
      // ── PDA vault flow: build claim_tournament_prize, authority pre-signs, return for user co-sign ──
      const { getTournamentParticipantPDA, buildClaimTournamentPrizeIx } = await import('solana-client');

      const tournamentPda = new PublicKey(tournament.onChainPda);
      const vaultPda = new PublicKey(tournament.onChainVault!);
      const [participantPda] = getTournamentParticipantPDA(tournamentPda, winnerPubkey);
      const feeWallet = await getAssociatedTokenAddress(usdcMint, authority.publicKey);

      const ix = buildClaimTournamentPrizeIx(
        tournamentPda, participantPda, vaultPda,
        winnerAta, winnerPubkey, authority.publicKey, feeWallet,
      );

      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = winnerPubkey;
      tx.partialSign(authority);

      // Return partially-signed tx for user to co-sign
      const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

      return res.json({
        success: true,
        data: {
          prizeAmount: prizeAmount.toString(),
          feeAmount: feeAmount.toString(),
          transaction: serialized,
          usePda: true,
        },
      });
    } else {
      // ── Legacy flow: authority sends directly from ATA ──
      const authorityAta = await getAssociatedTokenAddress(usdcMint, authority.publicKey);

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

      signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    }

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

tournamentActionRouter.post('/admin/create', async (req, res) => {
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
tournamentActionRouter.post('/admin/:id/start', async (req, res) => {
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
tournamentActionRouter.post('/admin/:id/cancel', async (req, res) => {
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
