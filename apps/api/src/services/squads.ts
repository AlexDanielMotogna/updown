import crypto from 'crypto';
import { prisma } from '../db';
import { SquadRole } from '@prisma/client';

/**
 * Generate a random 8-character invite code.
 */
export function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Create a new squad and add the creator as OWNER.
 */
export async function createSquad(wallet: string, name: string) {
  const inviteCode = generateInviteCode();

  const squad = await prisma.squad.create({
    data: {
      name,
      inviteCode,
      creatorWallet: wallet,
      members: {
        create: {
          walletAddress: wallet,
          role: SquadRole.OWNER,
        },
      },
    },
    include: {
      members: true,
      _count: { select: { members: true, pools: true } },
    },
  });

  return squad;
}

/**
 * Resolve an invite code — returns squad name + member count (public, no auth needed).
 */
export async function resolveInviteCode(code: string) {
  const squad = await prisma.squad.findUnique({
    where: { inviteCode: code },
    select: {
      id: true,
      name: true,
      maxMembers: true,
      _count: { select: { members: true } },
    },
  });

  if (!squad) return null;

  return {
    id: squad.id,
    name: squad.name,
    memberCount: squad._count.members,
    maxMembers: squad.maxMembers,
  };
}

/**
 * Join a squad via invite code.
 */
export async function joinSquad(wallet: string, inviteCode: string) {
  const squad = await prisma.squad.findUnique({
    where: { inviteCode },
    include: { _count: { select: { members: true } } },
  });

  if (!squad) {
    throw new Error('INVALID_CODE');
  }

  if (squad._count.members >= squad.maxMembers) {
    throw new Error('SQUAD_FULL');
  }

  // Check if already a member
  const existing = await prisma.squadMember.findUnique({
    where: {
      squadId_walletAddress: { squadId: squad.id, walletAddress: wallet },
    },
  });

  if (existing) {
    throw new Error('ALREADY_MEMBER');
  }

  const member = await prisma.squadMember.create({
    data: {
      squadId: squad.id,
      walletAddress: wallet,
      role: SquadRole.MEMBER,
    },
  });

  return { squad, member };
}

/**
 * Leave a squad. Owner cannot leave.
 */
export async function leaveSquad(wallet: string, squadId: string) {
  const member = await prisma.squadMember.findUnique({
    where: {
      squadId_walletAddress: { squadId, walletAddress: wallet },
    },
  });

  if (!member) {
    throw new Error('NOT_MEMBER');
  }

  if (member.role === SquadRole.OWNER) {
    throw new Error('OWNER_CANNOT_LEAVE');
  }

  await prisma.squadMember.delete({
    where: { id: member.id },
  });
}

/**
 * Kick a member from a squad. Only the owner can kick.
 */
export async function kickMember(ownerWallet: string, squadId: string, targetWallet: string) {
  const owner = await prisma.squadMember.findUnique({
    where: {
      squadId_walletAddress: { squadId, walletAddress: ownerWallet },
    },
  });

  if (!owner || owner.role !== SquadRole.OWNER) {
    throw new Error('NOT_OWNER');
  }

  if (ownerWallet === targetWallet) {
    throw new Error('CANNOT_KICK_SELF');
  }

  const target = await prisma.squadMember.findUnique({
    where: {
      squadId_walletAddress: { squadId, walletAddress: targetWallet },
    },
  });

  if (!target) {
    throw new Error('TARGET_NOT_MEMBER');
  }

  await prisma.squadMember.delete({
    where: { id: target.id },
  });
}

/**
 * Check if a wallet is a member of a squad.
 */
export async function isSquadMember(wallet: string, squadId: string): Promise<boolean> {
  const member = await prisma.squadMember.findUnique({
    where: {
      squadId_walletAddress: { squadId, walletAddress: wallet },
    },
  });
  return !!member;
}

/**
 * Get squad leaderboard — stats of members within the squad's pools.
 */
export async function getSquadLeaderboard(squadId: string) {
  // Get all squad pool IDs
  const squadPools = await prisma.pool.findMany({
    where: { squadId },
    select: { id: true },
  });
  const poolIds = squadPools.map(p => p.id);

  if (poolIds.length === 0) {
    // Return members with zero stats
    const members = await prisma.squadMember.findMany({
      where: { squadId },
      select: { walletAddress: true, role: true },
    });
    return members.map(m => ({
      walletAddress: m.walletAddress,
      role: m.role,
      totalBets: 0,
      totalWins: 0,
      totalWagered: '0',
      netPnl: '0',
    }));
  }

  // Get all bets in squad pools
  const bets = await prisma.bet.findMany({
    where: { poolId: { in: poolIds } },
    include: {
      pool: { select: { winner: true } },
    },
  });

  // Aggregate per wallet
  const statsMap = new Map<string, {
    totalBets: number;
    totalWins: number;
    totalWagered: bigint;
    totalPayout: bigint;
  }>();

  for (const bet of bets) {
    const existing = statsMap.get(bet.walletAddress) || {
      totalBets: 0,
      totalWins: 0,
      totalWagered: 0n,
      totalPayout: 0n,
    };

    existing.totalBets++;
    existing.totalWagered += bet.amount;
    if (bet.pool.winner === bet.side) {
      existing.totalWins++;
      if (bet.payoutAmount) {
        existing.totalPayout += bet.payoutAmount;
      }
    }

    statsMap.set(bet.walletAddress, existing);
  }

  // Get all members to include those with no bets
  const members = await prisma.squadMember.findMany({
    where: { squadId },
    select: { walletAddress: true, role: true },
  });

  return members
    .map(m => {
      const stats = statsMap.get(m.walletAddress);
      const wagered = stats?.totalWagered ?? 0n;
      const payout = stats?.totalPayout ?? 0n;
      return {
        walletAddress: m.walletAddress,
        role: m.role,
        totalBets: stats?.totalBets ?? 0,
        totalWins: stats?.totalWins ?? 0,
        totalWagered: wagered.toString(),
        netPnl: (payout - wagered).toString(),
      };
    })
    .sort((a, b) => b.totalWins - a.totalWins);
}
