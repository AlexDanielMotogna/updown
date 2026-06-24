import type { Pool } from '@prisma/client';
import { prisma } from '../../db';
import { getXPosterConfig } from './config';
import { hasXCredentials, postTweet } from './client';

/**
 * X (Twitter) auto-poster — announces newly-created pools as plain-text tweets,
 * like Kalshi/Polymarket ("JUST IN: {title}" + a link). One tweet per pool
 * (dedup on Pool.xPostedAt). Write-only; never reads X data. Config-driven kill
 * switch + per-cycle cap; API keys come from env (see ./client).
 */

// Don't dump the whole backlog the first time the poster is enabled — only
// announce pools created within this window. Older pools are silently marked as
// posted so they never tweet.
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h

const WEB_BASE_URL = (process.env.WEB_BASE_URL || 'https://updown.my').replace(/\/+$/, '');

/** Public URL for a pool's detail page (crypto → /pool, sports/PM → /match). */
function poolUrl(pool: Pool): string {
  const path = pool.poolType === 'CRYPTO' ? 'pool' : 'match';
  return `${WEB_BASE_URL}/${path}/${pool.id}`;
}

/** Human title for a pool. Sports → "Home vs Away"; PM → the question (homeTeam),
 *  or "A vs B" for versus markets; crypto → "ASSET Up or Down". */
function poolTitle(pool: Pool): string {
  if (pool.poolType === 'SPORTS') {
    const match = pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam || 'Match';
    return pool.league ? `${pool.league}: ${match}` : match;
  }
  if (pool.poolType === 'POLYMARKET') {
    return pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam || 'New market';
  }
  return `${pool.asset} Up or Down`;
}

/** Build the tweet body from the template + optional link, clamped to 280 chars. */
function buildTweet(pool: Pool, template: string, includeLink: boolean): string {
  const title = poolTitle(pool);
  const link = includeLink ? `\n\n${poolUrl(pool)}` : '';
  // A t.co link always counts as 23 chars regardless of length; reserve for it.
  const linkBudget = includeLink ? 23 + 2 : 0; // 23 + the two newlines
  const maxTitle = 280 - linkBudget - (template.length - '{title}'.length);
  const safeTitle = title.length > maxTitle && maxTitle > 1 ? `${title.slice(0, maxTitle - 1)}…` : title;
  return template.replace('{title}', safeTitle) + link;
}

/** One pass: find unposted, recent, open pools of the enabled types and tweet them. */
export async function runXPosterCycle(): Promise<{ posted: number }> {
  const cfg = await getXPosterConfig();
  if (!cfg.enabled) return { posted: 0 };
  if (!hasXCredentials()) {
    console.warn('[XPoster] enabled but X credentials missing — skipping cycle');
    return { posted: 0 };
  }

  const types: string[] = [];
  if (cfg.postSports) types.push('SPORTS');
  if (cfg.postPm) types.push('POLYMARKET');
  if (cfg.postCrypto) types.push('CRYPTO');
  if (types.length === 0) return { posted: 0 };

  const now = Date.now();
  const candidates = await prisma.pool.findMany({
    where: {
      xPostedAt: null,
      poolType: { in: types },
      status: { in: ['UPCOMING', 'JOINING'] },
      lockTime: { gt: new Date(now) },
      createdAt: { gte: new Date(now - MAX_AGE_MS) },
    },
    orderBy: { createdAt: 'asc' },
    take: Math.max(1, cfg.perCycleCap),
  });

  // Pools older than the window that are still unposted: mark them so they never
  // tweet retroactively (keeps the candidate query cheap over time).
  await prisma.pool.updateMany({
    where: { xPostedAt: null, createdAt: { lt: new Date(now - MAX_AGE_MS) } },
    data: { xPostedAt: new Date() },
  });

  let posted = 0;
  for (const pool of candidates) {
    const text = buildTweet(pool, cfg.template, cfg.includeLink);
    try {
      const id = await postTweet(text);
      await prisma.pool.update({ where: { id: pool.id }, data: { xPostedAt: new Date() } });
      posted++;
      console.log(`[XPoster] tweeted pool=${pool.id.slice(0, 8)} tweet=${id}`);
    } catch (e) {
      // Leave xPostedAt null so it retries next cycle. Stop the cycle on the first
      // failure (likely rate limit / auth) to avoid burning the per-window quota.
      console.error('[XPoster] tweet failed:', e instanceof Error ? e.message : e);
      break;
    }
    // Space out posts so a cycle never bursts the write rate limit.
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (posted > 0) console.log(`[XPoster] cycle: ${posted} tweet(s)`);
  return { posted };
}

let running = false;
let timer: NodeJS.Timeout | null = null;

/** Self-rescheduling loop; re-reads intervalSeconds from config each pass. */
export function startXPoster(): void {
  const loop = async () => {
    let delayMs = 120_000;
    try {
      const cfg = await getXPosterConfig();
      delayMs = Math.max(30, cfg.intervalSeconds) * 1000;
      if (cfg.enabled && !running) {
        running = true;
        try { await runXPosterCycle(); } finally { running = false; }
      }
    } catch (e) {
      console.error('[XPoster] loop error:', e instanceof Error ? e.message : e);
    }
    timer = setTimeout(loop, delayMs);
  };
  console.log('[XPoster] scheduler started (config-driven)');
  timer = setTimeout(loop, 12_000);
}
