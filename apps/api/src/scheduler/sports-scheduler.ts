import { suggestStuckPoolResults } from './result-suggestions';
import { sweepStuckPmPools } from './pm-cancel';
import { findZombieSportsPools, logZombieSportsPools } from '../services/sports/pool-validation';
import { createMatchPools } from './sports-pool-creation';
import { resolveMatchPools } from './sports-pool-resolution';
import { sweepUnresolvedPools } from './sports-sweep';

// Barrel: keep the public surface stable for existing importers after the
// split into pool-creation / pool-resolution / pool-void / sweep modules.
export { createMatchPools, createSportsPool } from './sports-pool-creation';
export { resolveMatchPools } from './sports-pool-resolution';
export { voidSportsPool } from './sports-pool-void';

/**
 * Start the sports scheduler with cron jobs.
 */
export function startSportsScheduler(): void {
  // Create match pools every 2 hours
  const createInterval = setInterval(async () => {
    try {
      await createMatchPools();
    } catch (error) {
      console.error('[Sports] Scheduler create error:', error);
    }
  }, 2 * 60 * 60 * 1000);

  // Resolve finished matches every 2 minutes
  const resolveInterval = setInterval(async () => {
    try {
      await resolveMatchPools();
    } catch (error) {
      console.error('[Sports] Scheduler resolve error:', error);
    }
  }, 2 * 60 * 1000);

  // Safety net: sweep overdue pools every 15 minutes (kickoff >3h ago, still unresolved)
  setInterval(async () => {
    try {
      await sweepUnresolvedPools();
    } catch (error) {
      console.error('[Sports] Sweep error:', error);
    }
    try {
      // PM pools have a separate fate (UMA can stall for days, markets can be
      // delisted from Gamma). sweepStuckPmPools auto-cancels 0-bet pools past
      // the grace window; pools with bets are left for admin to cancel.
      await sweepStuckPmPools();
    } catch (error) {
      console.error('[Sports] PM sweep error:', error);
    }
    try {
      // For sports pools TheSportsDB never resolved, ask the web-search LLM and
      // queue a PENDING suggestion for admin review (never auto-resolves).
      await suggestStuckPoolResults();
    } catch (error) {
      console.error('[Sports] Result-suggestion error:', error);
    }
  }, 15 * 60 * 1000);

  // Layer 3 — Zombie sports pool audit, every 30 minutes. Finds pools
  // whose `lockTime + 2 × expected duration` is past with no live_score
  // row. Logs to event_log so the admin dashboard can surface them.
  // Doesn't auto-cancel — the operator decides what to do (force
  // refund / delete) because the bet count might be > 0.
  setInterval(async () => {
    try {
      const zombies = await findZombieSportsPools();
      if (zombies.length > 0) {
        console.warn(`[Sports] ZOMBIE AUDIT: ${zombies.length} pool(s) past expected end without live scores`);
        for (const z of zombies) {
          console.warn(`  [${z.id.slice(0, 8)}] ${z.league} ${z.homeTeam} vs ${z.awayTeam} — ${z.hoursOverdue}h overdue, ${z.betCount} bet(s)`);
        }
        await logZombieSportsPools(zombies);
      }
    } catch (error) {
      console.error('[Sports] Zombie audit error:', error);
    }
  }, 30 * 60 * 1000);

  // Initial pool creation is handled by fixture-sync.ts after dailySync completes.
  // Do NOT call createMatchPools() here to avoid duplicate pool creation.

  // Resolve any stuck pools 15s after startup (gives livescore poll time to populate)
  setTimeout(() => {
    resolveMatchPools().catch(e => console.error('[Sports] Initial resolve error:', e));
  }, 15_000);

  console.log('[Sports] Scheduler started (create: 2h, resolve: 2m, sweep: 15m, zombie audit: 30m, initial resolve: 15s)');
}
