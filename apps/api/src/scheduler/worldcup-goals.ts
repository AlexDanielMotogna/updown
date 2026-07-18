/**
 * Live goals feed — score-driven for speed.
 *
 * A goal is announced the instant the SCORE changes (from the fast live_scores overlay),
 * BEFORE SDB's event timeline has the scorer, as "⚡ GOAL — Team · scorer pending". A
 * later pass edits that same message to fill in "67' Player" once SDB's timeline catches
 * up. This decouples "a goal happened" (fast) from "who scored" (slow SDB timeline).
 *
 * State is persisted in WorldCupGoalCache.tgScore so a restart mid-match never re-posts
 * and can still fill scorers. On first sight of a live match, existing goals are treated
 * as a baseline (not retro-posted).
 *
 * SDB cost: getWorldCupMatches (cached schedule + live_scores DB overlay) each tick; the
 * timeline (SDB) is only fetched when there are goals awaiting a scorer. Gated by
 * WORLDCUP_TG_GOALS=true (default off).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { getWorldCupMatches, getWorldCupTimeline, type WorldCupGoal } from '../services/worldcup';
import { postScoreGoal, editScoreGoalScorer, notifyWorldCupLiveScore } from '../services/worldcup-telegram';

const POLL_MS = 30_000;
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

interface PostedGoal {
  side: 'home' | 'away';
  sideIdx: number;      // index within that team's goals in the full timeline
  home: number;         // score shown on this goal's message
  away: number;
  messageId: number;    // Telegram message to edit (0 = post failed)
  filled: boolean;      // scorer name already patched in
}
interface ScoreState {
  baseHome: number;     // goals already present when we started tracking (not posted)
  baseAway: number;
  seeded: boolean;
  posted: PostedGoal[];
}

function readState(v: unknown): ScoreState {
  const s = (v && typeof v === 'object' ? v : {}) as Partial<ScoreState>;
  return {
    baseHome: typeof s.baseHome === 'number' ? s.baseHome : 0,
    baseAway: typeof s.baseAway === 'number' ? s.baseAway : 0,
    seeded: s.seeded === true,
    posted: Array.isArray(s.posted) ? (s.posted as PostedGoal[]) : [],
  };
}
const asJson = (st: ScoreState) => st as unknown as Prisma.InputJsonValue;

/** One poll pass: post new goals on score change, fill scorers when SDB has them. */
export async function pollWorldCupGoalsOnce(): Promise<void> {
  if (!goalsFeedEnabled() || running) return;
  running = true;
  try {
    const live = (await getWorldCupMatches()).filter((m) => m.status === 'LIVE');
    for (const m of live) {
      const home = m.homeScore ?? 0;
      const away = m.awayScore ?? 0;

      const row = await prisma.worldCupGoalCache
        .findUnique({ where: { matchId: m.matchId }, select: { tgScore: true } })
        .catch(() => null);
      const st = readState(row?.tgScore);

      // First sight of this live match: baseline the existing goals, don't retro-post.
      if (!st.seeded) {
        const seeded: ScoreState = { baseHome: home, baseAway: away, seeded: true, posted: [] };
        await prisma.worldCupGoalCache
          .upsert({
            where: { matchId: m.matchId },
            update: { tgScore: asJson(seeded) },
            create: { matchId: m.matchId, goals: [], tgScore: asJson(seeded) },
          })
          .catch(() => {});
        continue;
      }

      const postedHome = st.posted.filter((g) => g.side === 'home').length;
      const postedAway = st.posted.filter((g) => g.side === 'away').length;
      const newHome = home - st.baseHome - postedHome;
      const newAway = away - st.baseAway - postedAway;
      const hasUnfilled = st.posted.some((g) => !g.filled && g.messageId);

      if (newHome <= 0 && newAway <= 0 && !hasUnfilled) continue; // nothing to do; skip SDB

      let changed = false;

      // 1) Post new goals instantly (scorer pending). Home first, then away.
      const post = async (side: 'home' | 'away', count: number, base: number, already: number) => {
        for (let i = 0; i < count; i++) {
          const messageId = await postScoreGoal({ homeTeam: m.homeTeam, awayTeam: m.awayTeam }, side, { home, away });
          st.posted.push({ side, sideIdx: base + already + i, home, away, messageId: messageId ?? 0, filled: false });
          changed = true;
        }
      };
      if (newHome > 0) await post('home', newHome, st.baseHome, postedHome);
      if (newAway > 0) await post('away', newAway, st.baseAway, postedAway);

      // 2) Fill scorers from SDB's timeline (only fetch it if something is pending).
      if (st.posted.some((g) => !g.filled && g.messageId)) {
        const goals = await getWorldCupTimeline(m.matchId).catch(() => [] as WorldCupGoal[]);
        const sideGoals = (side: 'home' | 'away') =>
          goals.filter((g) => g.side === side).sort((x, y) => (x.minute ?? 999) - (y.minute ?? 999));
        const homeGoals = sideGoals('home');
        const awayGoals = sideGoals('away');
        for (const pg of st.posted) {
          if (pg.filled || !pg.messageId) continue;
          const tg = (pg.side === 'home' ? homeGoals : awayGoals)[pg.sideIdx];
          if (tg && tg.player && tg.player !== 'Unknown') {
            await editScoreGoalScorer(pg.messageId, { homeTeam: m.homeTeam, awayTeam: m.awayTeam }, tg, { home: pg.home, away: pg.away });
            pg.filled = true;
            changed = true;
          }
        }
      }

      if (changed) {
        await prisma.worldCupGoalCache
          .update({ where: { matchId: m.matchId }, data: { tgScore: asJson(st) } })
          .catch((e) => console.warn('[WorldCupGoals] persist state failed:', e instanceof Error ? e.message : e));
      }
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
