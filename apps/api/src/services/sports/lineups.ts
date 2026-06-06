import { sportsDbFetchV2 } from './api-sports-fetch';

export interface LineupPlayer {
  id: string | null;
  name: string;
  number: string | null;
  position: string | null;
  positionShort: string | null;
  cutout: string | null;
  substitute: boolean;
}
export interface SideLineup {
  team: string | null;
  formation: string | null; // e.g. "4-3-3" — soccer only; null otherwise
  starters: LineupPlayer[];
  subs: LineupPlayer[];
}
export interface EventLineup {
  hasData: boolean;
  home: SideLineup | null;
  away: SideLineup | null;
}

const POS_ORDER: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };

/** Derive a soccer formation ("4-3-3") from the outfield starters' position
 *  bands. Returns null when it isn't a soccer-style lineup (other sports use
 *  different position codes, so D+M+F won't cover the outfield). */
function deriveFormation(starters: LineupPlayer[]): string | null {
  let d = 0, m = 0, f = 0;
  for (const p of starters) {
    if (p.positionShort === 'D') d++;
    else if (p.positionShort === 'M') m++;
    else if (p.positionShort === 'F') f++;
  }
  if (d + m + f >= 9) return `${d}-${m}-${f}`; // 10 outfield ± a borderline tag
  return null;
}

function buildSide(rows: any[]): SideLineup | null {
  if (rows.length === 0) return null;
  const players: LineupPlayer[] = rows.map(r => ({
    id: r.idPlayer ?? null,
    name: r.strPlayer ?? 'Unknown',
    number: r.intSquadNumber ?? null,
    position: r.strPosition ?? null,
    positionShort: r.strPositionShort ?? null,
    cutout: r.strCutout ?? null,
    substitute: r.strSubstitute === 'Yes',
  }));
  const byPos = (a: LineupPlayer, b: LineupPlayer) =>
    (POS_ORDER[a.positionShort ?? ''] ?? 9) - (POS_ORDER[b.positionShort ?? ''] ?? 9);
  const starters = players.filter(p => !p.substitute).sort(byPos);
  const subs = players.filter(p => p.substitute).sort(byPos);
  return { team: rows[0]?.strTeam ?? null, formation: deriveFormation(starters), starters, subs };
}

// Lineups are immutable once posted; cache positives long, recheck empties soon
// (an upcoming match's lineup lands ~1h before kickoff).
const cache = new Map<string, { data: EventLineup; at: number }>();
const TTL_POS = 6 * 60 * 60 * 1000;
const TTL_EMPTY = 5 * 60 * 1000;

export async function getEventLineup(matchId: string): Promise<EventLineup> {
  const cached = cache.get(matchId);
  if (cached) {
    const ttl = cached.data.hasData ? TTL_POS : TTL_EMPTY;
    if (Date.now() - cached.at < ttl) return cached.data;
  }

  let data: EventLineup = { hasData: false, home: null, away: null };
  try {
    const res = await sportsDbFetchV2(`lookup/event_lineup/${matchId}`);
    const all: any[] = Array.isArray(res?.lookup) ? res.lookup : [];
    // Only trust rows whose idEvent matches the requested match — guards against
    // ever showing a different/previous fixture's lineup (sports that play the
    // next day have bitten us before with stale cross-match data).
    const rows = all.filter(r => String(r.idEvent) === String(matchId));
    if (rows.length > 0) {
      const home = buildSide(rows.filter(r => r.strHome === 'Yes'));
      const away = buildSide(rows.filter(r => r.strHome === 'No'));
      data = { hasData: !!(home || away), home, away };
    }
  } catch (e) {
    console.warn(`[Lineups] fetch failed for ${matchId}:`, e instanceof Error ? e.message : e);
    // Don't cache hard errors — let the next request retry.
    return data;
  }

  cache.set(matchId, { data, at: Date.now() });
  return data;
}
