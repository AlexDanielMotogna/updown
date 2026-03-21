import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import {
  resolveReferralCode,
  acceptReferral,
  getReferralStats,
  getReferralEarnings,
  getReferralPayouts,
  claimReferralPayout,
} from '../services/referrals';

export const referralsRouter: RouterType = Router();

const walletSchema = z.string().min(32).max(44);

/**
 * GET /resolve?code=X
 * Public - resolves a referral code to a truncated wallet address.
 */
referralsRouter.get('/resolve', async (req, res) => {
  try {
    const code = z.string().min(1).max(20).safeParse(req.query.code);
    if (!code.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid referral code' },
      });
    }

    const wallet = await resolveReferralCode(code.data);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Referral code not found' },
      });
    }

    res.json({
      success: true,
      data: {
        referrerWallet: `${wallet.slice(0, 4)}...${wallet.slice(-4)}`,
      },
    });
  } catch (error) {
    console.error('Error resolving referral code:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve referral code' },
    });
  }
});

/**
 * POST /accept
 * Accept a referral link. Body: { walletAddress, referralCode }
 */
referralsRouter.post('/accept', async (req, res) => {
  try {
    const schema = z.object({
      walletAddress: walletSchema,
      referralCode: z.string().min(1).max(20),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
      });
    }

    const result = await acceptReferral(parsed.data.walletAddress, parsed.data.referralCode);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'REFERRAL_ERROR', message: result.error },
      });
    }

    res.json({ success: true, data: { status: 'accepted' } });
  } catch (error) {
    console.error('Error accepting referral:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to accept referral' },
    });
  }
});

/**
 * GET /stats?wallet=X
 * Dashboard stats for a referrer.
 */
referralsRouter.get('/stats', async (req, res) => {
  try {
    const wallet = walletSchema.safeParse(req.query.wallet);
    if (!wallet.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address' },
      });
    }

    const stats = await getReferralStats(wallet.data);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch referral stats' },
    });
  }
});

/**
 * GET /earnings?wallet=X&page=1&limit=20
 * Paginated earning history.
 */
referralsRouter.get('/earnings', async (req, res) => {
  try {
    const wallet = walletSchema.safeParse(req.query.wallet);
    if (!wallet.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address' },
      });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const result = await getReferralEarnings(wallet.data, page, limit);
    res.json({ success: true, data: result.earnings, meta: result.meta });
  } catch (error) {
    console.error('Error fetching referral earnings:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch referral earnings' },
    });
  }
});

/**
 * GET /payouts?wallet=X
 * Payout history with tx signatures.
 */
referralsRouter.get('/payouts', async (req, res) => {
  try {
    const wallet = walletSchema.safeParse(req.query.wallet);
    if (!wallet.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid wallet address' },
      });
    }

    const payouts = await getReferralPayouts(wallet.data);
    res.json({ success: true, data: payouts });
  } catch (error) {
    console.error('Error fetching referral payouts:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch referral payouts' },
    });
  }
});

/**
 * POST /claim
 * Claim unpaid referral earnings. Body: { walletAddress }
 */
referralsRouter.post('/claim', async (req, res) => {
  try {
    const schema = z.object({
      walletAddress: walletSchema,
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
      });
    }

    const result = await claimReferralPayout(parsed.data.walletAddress);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'CLAIM_ERROR', message: result.error },
      });
    }

    res.json({
      success: true,
      data: {
        payoutId: result.payoutId,
        amount: result.amount,
        txSignature: result.txSignature,
        status: 'completed',
      },
    });
  } catch (error) {
    console.error('Error claiming referral payout:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to claim referral payout' },
    });
  }
});
