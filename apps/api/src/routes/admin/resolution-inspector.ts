import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db';
import { polymarketFetch } from '../../services/sports/polymarket-fetch';
import { sportsDbFetch } from '../../services/sports/api-sports-fetch';
import { readCtfResolution } from '../../services/polymarket/ctf-resolver';

export const adminResolutionInspectorRouter: RouterType = Router();

/** resolved: true = source says resolved · false = not yet · null = N/A or error. */
interface Check { source: string; resolved: boolean | null; summary: string; data?: unknown; }

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
function safeArr(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}

/**
 * GET /admin/resolution-inspector?poolId=X
 * Inspect whether a pool's upstream resolution is available yet. Runs only the
 * checks relevant to the pool's source: Polymarket (Gamma) + UMA/CTF on-chain
 * for PM markets, TheSportsDB for sports, price for crypto — plus our own DB
 * state. Accepts either the pool UUID (id) or the on-chain poolId.
 */
adminResolutionInspectorRouter.get('/', async (req, res) => {
  try {
    const q = String(req.query.poolId ?? '').trim();
    if (!q) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'poolId required' } });

    const pool = await prisma.pool.findFirst({
      where: { OR: [{ id: q }, { poolId: q }] },
      select: {
        id: true, poolId: true, poolType: true, asset: true, status: true, winner: true,
        matchId: true, clobTokenIds: true, homeTeam: true, awayTeam: true, homeScore: true, awayScore: true,
        league: true, strikePrice: true, finalPrice: true, startTime: true, endTime: true, lockTime: true, closedAt: true,
      },
    });
    if (!pool) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pool not found' } });

    const checks: Check[] = [];
    const ended = pool.endTime.getTime() <= Date.now();

    // ── Our DB state ──────────────────────────────────────────────────────
    checks.push({
      source: 'Database (our resolution)',
      resolved: pool.winner != null || ['RESOLVED', 'CLAIMABLE', 'CLOSED', 'CANCELLED'].includes(pool.status),
      summary: `status=${pool.status} · winner=${pool.winner ?? '—'}`,
      data: { status: pool.status, winner: pool.winner, ended, closedAt: pool.closedAt },
    });

    const isPM = (pool.asset?.startsWith('PM_') ?? false) || !!pool.clobTokenIds;

    if (isPM) {
      // The conditionId we persisted at ingest (in the PM cache) is the
      // reliable source — Gamma DELISTS markets, so a live Gamma lookup
      // returns nothing exactly when we most need to resolve. Read it first.
      const cacheRow = pool.matchId
        ? await prisma.sportsFixtureCache.findFirst({
            where: { externalId: pool.matchId, sport: 'POLYMARKET' },
            select: { conditionId: true, status: true },
          })
        : null;
      let conditionId: string | null = cacheRow?.conditionId ?? null;

      // ── Polymarket (Gamma) ──────────────────────────────────────────────
      try {
        const data = await polymarketFetch(`/markets?id=${pool.matchId}`);
        const m = Array.isArray(data) ? data[0] : data;
        if (!m) {
          checks.push({ source: 'Polymarket (Gamma)', resolved: false, summary: `DELISTED from Gamma${conditionId ? ' (using cached conditionId for on-chain check)' : ''}`, data: { cacheStatus: cacheRow?.status ?? null, conditionId } });
        } else {
          conditionId = m.conditionId ?? conditionId;
          const resolved = !!m.closed && m.umaResolutionStatus === 'resolved';
          checks.push({
            source: 'Polymarket (Gamma)',
            resolved,
            summary: resolved
              ? `RESOLVED (${m.umaResolutionStatus})`
              : `open · closed=${m.closed} · umaStatus=${m.umaResolutionStatus ?? '—'}`,
            data: { closed: m.closed, umaResolutionStatus: m.umaResolutionStatus, outcomes: safeArr(m.outcomes), outcomePrices: safeArr(m.outcomePrices), conditionId, endDate: m.endDate },
          });
        }
      } catch (e) {
        checks.push({ source: 'Polymarket (Gamma)', resolved: null, summary: `Error: ${msg(e)}` });
      }

      // ── UMA / CTF on-chain (Polygon) — authoritative ────────────────────
      if (conditionId) {
        try {
          const r = await readCtfResolution(conditionId);
          checks.push({
            source: 'UMA / CTF (Polygon on-chain)',
            resolved: r.kind === 'resolved' ? true : r.kind === 'pending' ? false : null,
            summary: r.kind === 'resolved'
              ? `RESOLVED · outcome=${r.outcome === 1 ? 'YES' : 'NO'}`
              : r.kind === 'rpc-error' ? `RPC error (POLYGON_RPC_URL set?)` : r.kind,
            data: r,
          });
        } catch (e) {
          checks.push({ source: 'UMA / CTF (Polygon on-chain)', resolved: null, summary: `Error: ${msg(e)}` });
        }
      } else {
        checks.push({ source: 'UMA / CTF (Polygon on-chain)', resolved: null, summary: 'No conditionId (Gamma lookup needed first)' });
      }
    } else if (pool.poolType === 'SPORTS') {
      // ── TheSportsDB ─────────────────────────────────────────────────────
      try {
        const data = await sportsDbFetch(`lookupevent.php?id=${pool.matchId}`);
        const e = data?.events?.[0];
        if (!e) {
          checks.push({ source: 'TheSportsDB', resolved: null, summary: 'Event not found' });
        } else {
          const hs = e.intHomeScore, as = e.intAwayScore;
          const status: string = e.strStatus ?? '';
          const finished = /finish|^ft$|final|aet|after extra|ended/i.test(status) ||
            (hs != null && as != null && hs !== '' && as !== '');
          checks.push({
            source: 'TheSportsDB',
            resolved: finished,
            summary: finished ? `FINISHED ${hs}-${as} (${status || 'scores present'})` : `not final · status=${status || '—'}`,
            data: { status, homeScore: hs, awayScore: as, home: e.strHomeTeam, away: e.strAwayTeam, date: e.dateEvent },
          });
        }
      } catch (e) {
        checks.push({ source: 'TheSportsDB', resolved: null, summary: `Error: ${msg(e)}` });
      }
    } else {
      // ── Crypto (price-settled, no external oracle) ──────────────────────
      checks.push({
        source: 'Crypto price',
        resolved: pool.finalPrice != null,
        summary: pool.finalPrice != null ? 'final price recorded' : ended ? 'ended, awaiting final price' : 'not ended yet',
        data: { strikePrice: pool.strikePrice?.toString() ?? null, finalPrice: pool.finalPrice?.toString() ?? null, ended },
      });
    }

    res.json({
      success: true,
      data: {
        pool: {
          id: pool.id, poolId: pool.poolId, poolType: pool.poolType, asset: pool.asset,
          status: pool.status, winner: pool.winner, matchId: pool.matchId,
          homeTeam: pool.homeTeam, awayTeam: pool.awayTeam, league: pool.league,
          endTime: pool.endTime, ended,
        },
        checks,
      },
    });
  } catch (error) {
    console.error('[Admin] resolution-inspector error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to inspect resolution' } });
  }
});
