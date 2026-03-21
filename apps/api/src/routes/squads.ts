import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { serializePool } from '../utils/serializers';
import {
  createSquad,
  joinSquad,
  leaveSquad,
  kickMember,
  isSquadMember,
  resolveInviteCode,
  getSquadLeaderboard,
} from '../services/squads';
import { createSquadPool } from '../services/squad-pools';
import { emitSquadMessage, emitSquadPoolNew, emitSquadMemberJoined } from '../websocket';

export const squadsRouter: RouterType = Router();

const walletSchema = z.string().min(32).max(44);

// ─── POST /api/squads — Create a squad ──────────────────────────────────────

squadsRouter.post('/', async (req, res) => {
  try {
    const body = z.object({
      wallet: walletSchema,
      name: z.string().min(1).max(50).trim(),
    }).safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() } });
    }

    const squad = await createSquad(body.data.wallet, body.data.name);

    res.json({
      success: true,
      data: {
        id: squad.id,
        name: squad.name,
        inviteCode: squad.inviteCode,
        creatorWallet: squad.creatorWallet,
        maxMembers: squad.maxMembers,
        memberCount: squad._count.members,
        poolCount: squad._count.pools,
        createdAt: squad.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating squad:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create squad' } });
  }
});

// ─── GET /api/squads — List user's squads ───────────────────────────────────

squadsRouter.get('/', async (req, res) => {
  try {
    const wallet = walletSchema.safeParse(req.query.wallet);
    if (!wallet.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'wallet query param required' } });
    }

    const memberships = await prisma.squadMember.findMany({
      where: { walletAddress: wallet.data },
      include: {
        squad: {
          include: {
            _count: { select: { members: true, pools: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    // For each squad, count active pools (JOINING or ACTIVE)
    const squadIds = memberships.map(m => m.squad.id);
    const activePools = squadIds.length > 0
      ? await prisma.pool.groupBy({
          by: ['squadId'],
          where: { squadId: { in: squadIds }, status: { in: ['JOINING', 'ACTIVE'] } },
          _count: true,
        })
      : [];
    const activePoolMap = new Map(activePools.map(p => [p.squadId, p._count]));

    res.json({
      success: true,
      data: memberships.map(m => ({
        id: m.squad.id,
        name: m.squad.name,
        inviteCode: m.squad.inviteCode,
        creatorWallet: m.squad.creatorWallet,
        maxMembers: m.squad.maxMembers,
        memberCount: m.squad._count.members,
        poolCount: m.squad._count.pools,
        activePoolCount: activePoolMap.get(m.squad.id) ?? 0,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        createdAt: m.squad.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching squads:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch squads' } });
  }
});

// ─── GET /api/squads/resolve — Resolve invite code (public) ─────────────────

squadsRouter.get('/resolve', async (req, res) => {
  try {
    const code = z.string().min(1).safeParse(req.query.code);
    if (!code.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'code query param required' } });
    }

    const result = await resolveInviteCode(code.data);
    if (!result) {
      return res.status(404).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid invite code' } });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error resolving invite code:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve code' } });
  }
});

// ─── POST /api/squads/join — Join a squad ───────────────────────────────────

squadsRouter.post('/join', async (req, res) => {
  try {
    const body = z.object({
      wallet: walletSchema,
      inviteCode: z.string().min(1),
    }).safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() } });
    }

    const { squad, member } = await joinSquad(body.data.wallet, body.data.inviteCode);

    emitSquadMemberJoined(squad.id, {
      walletAddress: body.data.wallet,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    });

    res.json({
      success: true,
      data: {
        squadId: squad.id,
        squadName: squad.name,
        role: member.role,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'INVALID_CODE') {
      return res.status(404).json({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid invite code' } });
    }
    if (msg === 'SQUAD_FULL') {
      return res.status(400).json({ success: false, error: { code: 'SQUAD_FULL', message: 'Squad is full' } });
    }
    if (msg === 'ALREADY_MEMBER') {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_MEMBER', message: 'Already a member' } });
    }
    console.error('Error joining squad:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to join squad' } });
  }
});

// ─── GET /api/squads/:id — Squad detail ─────────────────────────────────────

squadsRouter.get('/:id', async (req, res) => {
  try {
    const wallet = walletSchema.safeParse(req.query.wallet);
    if (!wallet.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'wallet query param required' } });
    }

    const squad = await prisma.squad.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          orderBy: { joinedAt: 'asc' },
          select: { walletAddress: true, role: true, joinedAt: true },
        },
        _count: { select: { members: true, pools: true } },
      },
    });

    if (!squad) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Squad not found' } });
    }

    // Verify caller is a member
    const isMember = squad.members.some(m => m.walletAddress === wallet.data);
    if (!isMember) {
      return res.status(403).json({ success: false, error: { code: 'NOT_MEMBER', message: 'Not a member of this squad' } });
    }

    res.json({
      success: true,
      data: {
        id: squad.id,
        name: squad.name,
        inviteCode: squad.inviteCode,
        creatorWallet: squad.creatorWallet,
        maxMembers: squad.maxMembers,
        memberCount: squad._count.members,
        poolCount: squad._count.pools,
        members: squad.members.map(m => ({
          walletAddress: m.walletAddress,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        })),
        createdAt: squad.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching squad:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch squad' } });
  }
});

// ─── POST /api/squads/:id/leave — Leave squad ──────────────────────────────

squadsRouter.post('/:id/leave', async (req, res) => {
  try {
    const body = z.object({ wallet: walletSchema }).safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'wallet required' } });
    }

    await leaveSquad(body.data.wallet, req.params.id);

    res.json({ success: true, data: { message: 'Left squad' } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'NOT_MEMBER') {
      return res.status(404).json({ success: false, error: { code: 'NOT_MEMBER', message: 'Not a member' } });
    }
    if (msg === 'OWNER_CANNOT_LEAVE') {
      return res.status(400).json({ success: false, error: { code: 'OWNER_CANNOT_LEAVE', message: 'Owner cannot leave the squad' } });
    }
    console.error('Error leaving squad:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to leave squad' } });
  }
});

// ─── DELETE /api/squads/:id/members/:wallet — Kick member ───────────────────

squadsRouter.delete('/:id/members/:wallet', async (req, res) => {
  try {
    const ownerWallet = walletSchema.safeParse(req.query.wallet);
    if (!ownerWallet.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'wallet query param required (owner)' } });
    }

    await kickMember(ownerWallet.data, req.params.id, req.params.wallet);

    res.json({ success: true, data: { message: 'Member kicked' } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'NOT_OWNER') {
      return res.status(403).json({ success: false, error: { code: 'NOT_OWNER', message: 'Only the owner can kick members' } });
    }
    if (msg === 'TARGET_NOT_MEMBER') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Target is not a member' } });
    }
    console.error('Error kicking member:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to kick member' } });
  }
});

// ─── GET /api/squads/:id/pools — Squad pools ───────────────────────────────

squadsRouter.get('/:id/pools', async (req, res) => {
  try {
    const wallet = walletSchema.safeParse(req.query.wallet);
    if (!wallet.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'wallet query param required' } });
    }

    if (!(await isSquadMember(wallet.data, req.params.id))) {
      return res.status(403).json({ success: false, error: { code: 'NOT_MEMBER', message: 'Not a member' } });
    }

    const pools = await prisma.pool.findMany({
      where: { squadId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { bets: true } },
      },
    });

    // Count bets per side
    const poolIds = pools.map(p => p.id);
    const sideCounts = poolIds.length > 0
      ? await prisma.bet.groupBy({
          by: ['poolId', 'side'],
          where: { poolId: { in: poolIds } },
          _count: true,
        })
      : [];

    const sideCountMap = new Map<string, { upCount: number; downCount: number }>();
    for (const row of sideCounts) {
      const existing = sideCountMap.get(row.poolId) || { upCount: 0, downCount: 0 };
      if (row.side === 'UP') existing.upCount = row._count;
      else existing.downCount = row._count;
      sideCountMap.set(row.poolId, existing);
    }

    res.json({
      success: true,
      data: pools.map(pool => {
        const counts = sideCountMap.get(pool.id) || { upCount: 0, downCount: 0 };
        return {
          ...serializePool(pool),
          squadId: pool.squadId,
          maxBettors: pool.maxBettors,
          betCount: pool._count.bets,
          upCount: counts.upCount,
          downCount: counts.downCount,
        };
      }),
    });
  } catch (error) {
    console.error('Error fetching squad pools:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch squad pools' } });
  }
});

// ─── POST /api/squads/:id/pools — Create pool in squad ─────────────────────

squadsRouter.post('/:id/pools', async (req, res) => {
  try {
    const body = z.object({
      wallet: walletSchema,
      asset: z.string().min(1),
      durationSeconds: z.number().int().min(60).max(86400),
      maxBettors: z.number().int().min(2).max(100).optional(),
    }).safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() } });
    }

    const poolId = await createSquadPool({
      wallet: body.data.wallet,
      squadId: req.params.id,
      asset: body.data.asset,
      durationSeconds: body.data.durationSeconds,
      maxBettors: body.data.maxBettors,
    });

    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
      include: { _count: { select: { bets: true } } },
    });

    if (pool) {
      emitSquadPoolNew(req.params.id, {
        ...serializePool(pool),
        squadId: pool.squadId,
        maxBettors: pool.maxBettors,
        betCount: pool._count.bets,
        upCount: 0,
        downCount: 0,
      });
    }

    res.json({
      success: true,
      data: { poolId },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'NOT_MEMBER') {
      return res.status(403).json({ success: false, error: { code: 'NOT_MEMBER', message: 'Not a member of this squad' } });
    }
    if (msg === 'INVALID_ASSET') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_ASSET', message: 'Asset must be BTC, ETH, or SOL' } });
    }
    if (msg === 'INVALID_DURATION') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_DURATION', message: 'Duration must be between 60 and 86400 seconds' } });
    }
    console.error('Error creating squad pool:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create squad pool' } });
  }
});

// ─── GET /api/squads/:id/leaderboard — Squad leaderboard ───────────────────

squadsRouter.get('/:id/leaderboard', async (req, res) => {
  try {
    const wallet = walletSchema.safeParse(req.query.wallet);
    if (!wallet.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'wallet query param required' } });
    }

    if (!(await isSquadMember(wallet.data, req.params.id))) {
      return res.status(403).json({ success: false, error: { code: 'NOT_MEMBER', message: 'Not a member' } });
    }

    const leaderboard = await getSquadLeaderboard(req.params.id);

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch leaderboard' } });
  }
});

// ─── GET /api/squads/:id/messages — Chat messages ──────────────────────────

squadsRouter.get('/:id/messages', async (req, res) => {
  try {
    const wallet = walletSchema.safeParse(req.query.wallet);
    if (!wallet.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'wallet query param required' } });
    }

    if (!(await isSquadMember(wallet.data, req.params.id))) {
      return res.status(403).json({ success: false, error: { code: 'NOT_MEMBER', message: 'Not a member' } });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before ? new Date(req.query.before as string) : undefined;

    const messages = await prisma.squadMessage.findMany({
      where: {
        squadId: req.params.id,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      success: true,
      data: messages.map(m => ({
        id: m.id,
        walletAddress: m.walletAddress,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch messages' } });
  }
});

// ─── POST /api/squads/:id/messages — Send message ──────────────────────────

squadsRouter.post('/:id/messages', async (req, res) => {
  try {
    const body = z.object({
      wallet: walletSchema,
      content: z.string().min(1).max(500).trim(),
    }).safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: body.error.flatten() } });
    }

    if (!(await isSquadMember(body.data.wallet, req.params.id))) {
      return res.status(403).json({ success: false, error: { code: 'NOT_MEMBER', message: 'Not a member' } });
    }

    const message = await prisma.squadMessage.create({
      data: {
        squadId: req.params.id,
        walletAddress: body.data.wallet,
        content: body.data.content,
      },
    });

    const serialized = {
      id: message.id,
      walletAddress: message.walletAddress,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };

    emitSquadMessage(req.params.id, serialized);

    res.json({ success: true, data: serialized });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to send message' } });
  }
});
