import { prisma } from '../db';
import { getCachedFixtureResults } from '../services/sports/fixture-cache';
import { fetchFinalResultFromChatGPT } from '../services/sports/llm-result';

/**
 * Auto-suggest final results for STUCK sports pools — TheSportsDB never posted
 * the FT, so the resolver has nothing. We ask the web-search LLM and, when it's
 * confident, store a PENDING ResolutionSuggestion for an admin to review in the
 * "Needs review" tab. NEVER resolves a pool automatically.
 */

const cooldown = new Map<string, number>(); // poolId -> next allowed timestamp
const COOLDOWN_MS = 60 * 60 * 1000;          // re-ask at most hourly per pool
const MAX_PER_CYCLE = 4;                      // cap OpenAI calls per run

export async function suggestStuckPoolResults(): Promise<void> {
  const now = new Date();

  // Stuck = sports, still open, match should be over (endTime passed), and we
  // have the teams to ask about.
  const stuck = await prisma.pool.findMany({
    where: {
      poolType: 'SPORTS',
      status: { in: ['JOINING', 'ACTIVE'] },
      matchId: { not: null },
      endTime: { lt: now },
      homeTeam: { not: null },
      awayTeam: { not: null },
    },
    select: { id: true, matchId: true, homeTeam: true, awayTeam: true, league: true, startTime: true },
    orderBy: { endTime: 'asc' },
    take: 50,
  });
  if (stuck.length === 0) return;

  // Skip pools the resolver can already settle (a real result exists).
  const matchIds = [...new Set(stuck.map(p => p.matchId!).filter(Boolean))] as string[];
  const haveResult = await getCachedFixtureResults(matchIds);

  // Skip pools that already have a suggestion (any status).
  const existing = await prisma.resolutionSuggestion.findMany({
    where: { poolId: { in: stuck.map(p => p.id) } },
    select: { poolId: true },
  });
  const hasSuggestion = new Set(existing.map(e => e.poolId));

  let calls = 0;
  for (const pool of stuck) {
    if (calls >= MAX_PER_CYCLE) break;
    if (!pool.matchId || !pool.homeTeam || !pool.awayTeam) continue;
    if (haveResult.has(pool.matchId)) continue;   // resolver will handle it
    if (hasSuggestion.has(pool.id)) continue;
    if (Date.now() < (cooldown.get(pool.id) ?? 0)) continue;

    cooldown.set(pool.id, Date.now() + COOLDOWN_MS);
    calls++;

    const date = pool.startTime.toISOString().slice(0, 10);
    const payload = await fetchFinalResultFromChatGPT({
      homeTeam: pool.homeTeam, awayTeam: pool.awayTeam, date, league: pool.league ?? 'football',
    });
    const r = payload.result;
    if (!r || !r.finished || !r.confident || r.homeScore == null || r.awayScore == null) {
      console.log(`[ResultSuggest] ${pool.homeTeam} vs ${pool.awayTeam}: no confident result (${payload.error ?? r?.note ?? 'n/a'})`);
      continue;
    }

    const winner = r.homeScore > r.awayScore ? 'UP' : r.awayScore > r.homeScore ? 'DOWN' : 'DRAW';
    await prisma.resolutionSuggestion.upsert({
      where: { poolId: pool.id },
      create: {
        poolId: pool.id, matchId: pool.matchId, homeTeam: pool.homeTeam, awayTeam: pool.awayTeam,
        league: pool.league, matchDate: date, homeScore: r.homeScore, awayScore: r.awayScore,
        suggestedWinner: winner, finished: r.finished, confident: r.confident, note: r.note ?? null,
        model: payload.model, status: 'PENDING',
      },
      update: {
        homeScore: r.homeScore, awayScore: r.awayScore, suggestedWinner: winner,
        note: r.note ?? null, model: payload.model, status: 'PENDING',
      },
    });
    console.log(`[ResultSuggest] Suggested ${pool.homeTeam} ${r.homeScore}-${r.awayScore} ${pool.awayTeam} -> ${winner} (pool ${pool.id})`);
  }
}
