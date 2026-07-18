import type { WorldCupPhase } from '@prisma/client';
import { prisma } from '../db';
import { getWorldCupMatches } from './worldcup';
import { fetchWorldCupResultFromChatGPT } from './worldcup-llm';

/**
 * World Cup contest admin: confirm the official result per match (auto-suggested
 * from SDB, editable for penalty shootouts), grade predictions (exact score + phase),
 * and raffle 2 winners among the correct predictors.
 */

const RAFFLE_WINNERS = 2;

export async function getWorldCupAdminOverview() {
  const matches = await getWorldCupMatches();
  const ids = matches.map((m) => m.matchId);
  if (ids.length === 0) return [];

  const [results, predCounts, winnerCounts] = await Promise.all([
    prisma.worldCupResult.findMany({ where: { matchId: { in: ids } } }),
    prisma.worldCupPrediction.groupBy({ by: ['matchId'], _count: true, where: { matchId: { in: ids } } }),
    prisma.worldCupWinner.groupBy({ by: ['matchId'], _count: true, where: { matchId: { in: ids } } }),
  ]);
  const resultBy = new Map(results.map((r) => [r.matchId, r]));
  const predCountBy = new Map(predCounts.map((p) => [p.matchId, p._count]));
  const winnerCountBy = new Map(winnerCounts.map((w) => [w.matchId, w._count]));

  // Correct-count only for matches with a saved result.
  const correctBy = new Map<string, number>();
  for (const r of results) {
    const c = await prisma.worldCupPrediction.count({
      where: { matchId: r.matchId, homeScore: r.homeScore, awayScore: r.awayScore, phase: r.phase },
    });
    correctBy.set(r.matchId, c);
  }

  const items = matches.map((m) => {
    const r = resultBy.get(m.matchId);
    return {
      matchId: m.matchId,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      round: m.round,
      kickoff: m.kickoff,
      status: m.status,
      predictionCount: predCountBy.get(m.matchId) ?? 0,
      result: r ? { homeScore: r.homeScore, awayScore: r.awayScore, phase: r.phase } : null,
      correctCount: r ? correctBy.get(m.matchId) ?? 0 : null,
      winnerCount: winnerCountBy.get(m.matchId) ?? 0,
    };
  });

  // ContestUsers are the World Cup contest signups (X/Google/email). They are a SEPARATE
  // table from the app's `User` model, so they never show in the normal Users admin tab.
  const contestUsers = await prisma.contestUser.count();
  return { matches: items, contestUsers };
}

/** First 7 alpha chars of an email local-part — used to spot same-person farm clusters. */
function emailRoot(email: string | null): string | null {
  if (!email) return null;
  const key = email.split('@')[0].toLowerCase().replace(/[^a-z]/g, '').slice(0, 7);
  return key.length >= 4 ? key : null;
}

/**
 * All World Cup contest signups with join date + pick count, PLUS anti-farm signals
 * (shared email-root, shared signup IP) so an admin can eyeball and manually ban.
 * Signals are advisory only — nothing is banned automatically.
 */
export async function getWorldCupContestUsers() {
  const users = await prisma.contestUser.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { predictions: true } } },
  });

  // Count how many accounts share each email-root and each IP.
  const rootCounts = new Map<string, number>();
  const ipCounts = new Map<string, number>();
  for (const u of users) {
    const r = emailRoot(u.email);
    if (r) rootCounts.set(r, (rootCounts.get(r) ?? 0) + 1);
    if (u.signupIp) ipCounts.set(u.signupIp, (ipCounts.get(u.signupIp) ?? 0) + 1);
  }

  return users.map((u) => {
    const r = emailRoot(u.email);
    const reasons: string[] = [];
    if (r && (rootCounts.get(r) ?? 0) >= 2) reasons.push('email-cluster');
    if (u.signupIp && (ipCounts.get(u.signupIp) ?? 0) >= 2) reasons.push('shared-ip');
    return {
      id: u.id,
      provider: u.provider,
      xHandle: u.xHandle,
      email: u.email,
      displayName: u.displayName,
      signupIp: u.signupIp,
      banned: u.banned,
      suspicionReasons: reasons,
      createdAt: u.createdAt.toISOString(),
      predictionCount: u._count.predictions,
    };
  });
}

/** Ban (or unban) a contest user. Banned users are excluded from the raffle. Manual only. */
export async function setContestUserBanned(id: string, banned: boolean): Promise<{ ok: boolean }> {
  const existing = await prisma.contestUser.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false };
  await prisma.contestUser.update({
    where: { id },
    data: { banned, bannedAt: banned ? new Date() : null },
  });
  return { ok: true };
}

export async function getWorldCupMatchDetail(matchId: string) {
  const matches = await getWorldCupMatches();
  const m = matches.find((x) => x.matchId === matchId) ?? null;

  const [result, predictions, winners] = await Promise.all([
    prisma.worldCupResult.findUnique({ where: { matchId } }),
    prisma.worldCupPrediction.findMany({ where: { matchId }, include: { user: true }, orderBy: { createdAt: 'asc' } }),
    prisma.worldCupWinner.findMany({ where: { matchId } }),
  ]);
  const winnerBy = new Map(winners.map((w) => [w.contestUserId, w]));

  const graded = predictions.map((p) => {
    const win = winnerBy.get(p.contestUserId);
    return {
      contestUserId: p.contestUserId,
      homeScore: p.homeScore,
      awayScore: p.awayScore,
      phase: p.phase,
      provider: p.user.provider,
      xHandle: p.user.xHandle,
      email: p.user.email,
      displayName: p.user.displayName,
      correct: result ? p.homeScore === result.homeScore && p.awayScore === result.awayScore && p.phase === result.phase : null,
      isWinner: win != null,
      // Prize-claim status (only meaningful for winners)
      payoutWallet: win?.payoutWallet ?? null,
      claimedAt: win?.claimedAt ? win.claimedAt.toISOString() : null,
      paidTx: win?.paidTx ?? null,
    };
  });

  // SDB suggestion when the match is finished (penalties still need a manual score).
  const suggestion = m && m.status === 'FINISHED' && m.homeScore != null && m.awayScore != null
    ? { homeScore: m.homeScore, awayScore: m.awayScore, phase: (m.phase ?? 'REGULATION') as WorldCupPhase }
    : null;

  return {
    match: m ? { matchId: m.matchId, homeTeam: m.homeTeam, awayTeam: m.awayTeam, round: m.round, kickoff: m.kickoff, status: m.status } : null,
    suggestion,
    result: result ? { homeScore: result.homeScore, awayScore: result.awayScore, phase: result.phase, homePens: result.homePens, awayPens: result.awayPens } : null,
    predictions: graded,
  };
}

export async function saveWorldCupResult(
  matchId: string, homeScore: number, awayScore: number, phase: WorldCupPhase,
  homePens?: number | null, awayPens?: number | null,
) {
  // Only keep a shootout score when the match was decided on penalties.
  const hp = phase === 'PENALTIES' ? homePens ?? null : null;
  const ap = phase === 'PENALTIES' ? awayPens ?? null : null;
  return prisma.worldCupResult.upsert({
    where: { matchId },
    update: { homeScore, awayScore, phase, homePens: hp, awayPens: ap },
    create: { matchId, homeScore, awayScore, phase, homePens: hp, awayPens: ap },
  });
}

/** Ask ChatGPT (web search) for a finished match result to pre-fill the admin form. Suggest only. */
export async function askWorldCupResultLlm(matchId: string) {
  const matches = await getWorldCupMatches();
  const m = matches.find((x) => x.matchId === matchId);
  if (!m) return { sent: null, model: '', result: null, error: 'Match not found' };
  const date = m.kickoff ? m.kickoff.slice(0, 10) : '';
  return fetchWorldCupResultFromChatGPT({ homeTeam: m.homeTeam, awayTeam: m.awayTeam, date });
}

/**
 * Mark (or unmark) a raffle winner's prize as paid. `paid=true` stores the payout
 * reference in `paidTx` (the tx signature, or 'manual' when paid off-chain);
 * `paid=false` clears it back to unpaid so a mistaken mark can be undone.
 */
export async function setWorldCupWinnerPaid(
  matchId: string, contestUserId: string, paid: boolean, tx?: string | null,
): Promise<{ ok: true } | { ok: false; reason: 'NOT_FOUND' }> {
  const win = await prisma.worldCupWinner.findUnique({
    where: { matchId_contestUserId: { matchId, contestUserId } },
  });
  if (!win) return { ok: false, reason: 'NOT_FOUND' };
  const paidTx = paid ? (tx?.trim() || 'manual') : null;
  await prisma.worldCupWinner.update({ where: { id: win.id }, data: { paidTx } });
  return { ok: true };
}

export interface RaffleWinner {
  provider: string | null;
  xHandle: string | null;
  email: string | null;
  displayName: string | null;
}

export async function runWorldCupRaffle(matchId: string): Promise<{ ok: true; winners: RaffleWinner[] } | { ok: false; reason: 'NO_RESULT' | 'NO_CORRECT' }> {
  const result = await prisma.worldCupResult.findUnique({ where: { matchId } });
  if (!result) return { ok: false, reason: 'NO_RESULT' };

  const correct = await prisma.worldCupPrediction.findMany({
    where: {
      matchId, homeScore: result.homeScore, awayScore: result.awayScore, phase: result.phase,
      user: { banned: false }, // banned (suspected farm) accounts don't enter the raffle
    },
    include: { user: true },
  });
  if (correct.length === 0) return { ok: false, reason: 'NO_CORRECT' };

  const shuffled = [...correct].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, RAFFLE_WINNERS);

  await prisma.$transaction([
    prisma.worldCupWinner.deleteMany({ where: { matchId } }),
    prisma.worldCupWinner.createMany({ data: picked.map((p) => ({ matchId, contestUserId: p.contestUserId })) }),
  ]);

  return {
    ok: true,
    winners: picked.map((p) => ({ provider: p.user.provider, xHandle: p.user.xHandle, email: p.user.email, displayName: p.user.displayName })),
  };
}

/**
 * Team crests come from TheSportsDB's CDN, which sends no CORS headers, so drawing
 * them straight onto a <canvas> would taint it and break the winner-card PNG export.
 * We proxy them here as same-origin data URIs. Host is allow-listed (no open proxy)
 * and the response is size-capped.
 */
const CREST_HOST_ALLOW = new Set(['r2.thesportsdb.com', 'www.thesportsdb.com', 'thesportsdb.com']);
const CREST_MAX_BYTES = 1_000_000;

async function crestToDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !CREST_HOST_ALLOW.has(parsed.hostname)) return null;
  try {
    const resp = await fetch(parsed.toString());
    if (!resp.ok) return null;
    const type = resp.headers.get('content-type') ?? 'image/png';
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length === 0 || buf.length > CREST_MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Assets for the shareable winner card: team crests inlined as same-origin data URIs. */
export async function getWorldCupWinnerCardAssets(matchId: string) {
  const matches = await getWorldCupMatches();
  const m = matches.find((x) => x.matchId === matchId);
  if (!m) return { homeCrest: null, awayCrest: null };
  const [homeCrest, awayCrest] = await Promise.all([crestToDataUri(m.homeCrest), crestToDataUri(m.awayCrest)]);
  return { homeCrest, awayCrest };
}

/**
 * Every raffled winner of a graded match, with the fields the shareable card needs
 * (team + score + identity). Powers the marketing tab's "download a winner card" list.
 */
export async function getWorldCupWinnerCards() {
  const matches = await getWorldCupMatches();
  const byId = new Map(matches.map((m) => [m.matchId, m]));
  const winners = await prisma.worldCupWinner.findMany({ orderBy: { createdAt: 'desc' } });
  if (winners.length === 0) return [];
  const matchIds = [...new Set(winners.map((w) => w.matchId))];
  const userIds = [...new Set(winners.map((w) => w.contestUserId))];
  const [results, users] = await Promise.all([
    prisma.worldCupResult.findMany({ where: { matchId: { in: matchIds } } }),
    prisma.contestUser.findMany({ where: { id: { in: userIds } } }),
  ]);
  const resultBy = new Map(results.map((r) => [r.matchId, r]));
  const userBy = new Map(users.map((u) => [u.id, u]));
  return winners.flatMap((w) => {
    const m = byId.get(w.matchId);
    const r = resultBy.get(w.matchId);
    const u = userBy.get(w.contestUserId);
    if (!m || !r || !u) return []; // only winners of a graded match can be carded
    return [{
      matchId: w.matchId,
      contestUserId: w.contestUserId,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      round: m.round,
      kickoff: m.kickoff,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      handle: u.xHandle,
      email: u.email,
      displayName: u.displayName,
      paid: w.paidTx != null,
    }];
  });
}
