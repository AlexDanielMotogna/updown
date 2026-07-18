/**
 * Live goals feed: every ~60s, for each LIVE World Cup match, read the (already-cached)
 * goal timeline, detect goals not yet announced, and post each to Telegram with the
 * running score. Dedup is persisted in WorldCupGoalCache.tgPostedKeys so a restart
 * mid-match doesn't re-post.
 *
 * Cost: only while matches are LIVE (a few SDB calls/min, within the free 30/min).
 * Gated by WORLDCUP_TG_GOALS=true (default OFF) so it never polls unless enabled.
 */

import { prisma } from '../db';
import { getWorldCupMatches, getWorldCupTimeline, type WorldCupGoal } from '../services/worldcup';
import { notifyWorldCupGoal, notifyWorldCupLiveScore } from '../services/worldcup-telegram';

const POLL_MS = 60_000;
const LIVE_DIGEST_MS = 5 * 60_000;
let running = false;
let digestRunning = false;

function credsSet(): boolean {
  return !!process.env.WORLDCUP_TG_BOT_TOKEN?.trim() && !!process.env.WORLDCUP_TG_CHAT_ID?.trim();
}

function goalsFeedEnabled(): boolean {
  return credsSet() && (process.env.WORLDCUP_TG_GOALS ?? '').toLowerCase() === 'true';
}

function liveDigestEnabled(): boolean {
  return credsSet() && (process.env.WORLDCUP_TG_LIVE ?? '').toLowerCase() === 'true';
}

function goalKey(g: WorldCupGoal): string {
  return `${g.minute ?? '?'}-${g.side}-${g.kind}-${g.player}`.toLowerCase();
}

/** One poll pass. Safe to call repeatedly; no-ops when disabled or already running. */
export async function pollWorldCupGoalsOnce(): Promise<void> {
  if (!goalsFeedEnabled() || running) return;
  running = true;
  try {
    const live = (await getWorldCupMatches()).filter((m) => m.status === 'LIVE');
    for (const m of live) {
      const goals = await getWorldCupTimeline(m.matchId).catch(() => [] as WorldCupGoal[]);
      if (goals.length === 0) continue;

      const row = await prisma.worldCupGoalCache
        .findUnique({ where: { matchId: m.matchId }, select: { tgPostedKeys: true } })
        .catch(() => null);
      const posted = new Set<string>(Array.isArray(row?.tgPostedKeys) ? (row!.tgPostedKeys as string[]) : []);

      // Goals are minute-sorted; compute the running score at each goal.
      let h = 0;
      let a = 0;
      const toPost: { goal: WorldCupGoal; home: number; away: number }[] = [];
      for (const g of goals) {
        if (g.side === 'home') h++;
        else a++;
        if (!posted.has(goalKey(g))) toPost.push({ goal: g, home: h, away: a });
      }
      if (toPost.length === 0) continue;

      for (const item of toPost) {
        await notifyWorldCupGoal({ homeTeam: m.homeTeam, awayTeam: m.awayTeam }, item.goal, { home: item.home, away: item.away });
        posted.add(goalKey(item.goal));
      }
      await prisma.worldCupGoalCache
        .update({ where: { matchId: m.matchId }, data: { tgPostedKeys: [...posted] } })
        .catch((e) => console.warn('[WorldCupGoals] persist posted keys failed:', e instanceof Error ? e.message : e));
    }
  } catch (e) {
    console.warn('[WorldCupGoals] poll failed:', e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Recurring live-score digest for each LIVE match (every 5 min). Independent of the goals feed. */
export async function pollWorldCupLiveDigestOnce(): Promise<void> {
  if (!liveDigestEnabled() || digestRunning) return;
  digestRunning = true;
  try {
    const live = (await getWorldCupMatches()).filter((m) => m.status === 'LIVE');
    for (const m of live) {
      const goals = await getWorldCupTimeline(m.matchId).catch(() => [] as WorldCupGoal[]);
      await notifyWorldCupLiveScore(
        { homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore: m.homeScore ?? 0, awayScore: m.awayScore ?? 0, progress: m.progress },
        goals,
      );
    }
  } catch (e) {
    console.warn('[WorldCupGoals] live digest failed:', e instanceof Error ? e.message : e);
  } finally {
    digestRunning = false;
  }
}

export function startWorldCupGoalsFeed(): void {
  setInterval(() => { void pollWorldCupGoalsOnce(); }, POLL_MS);
  setInterval(() => { void pollWorldCupLiveDigestOnce(); }, LIVE_DIGEST_MS);
  console.log('[WorldCupGoals] feeds registered (goals: WORLDCUP_TG_GOALS=true · live digest: WORLDCUP_TG_LIVE=true)');
}
