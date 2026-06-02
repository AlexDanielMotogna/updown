import { prisma } from '../../db';
import { sportsDbFetch } from './api-sports-fetch';

/**
 * Combat-sport fighter image resolver.
 *
 * SDB hides fighter photos behind a separate endpoint (`searchplayers.php?p=
 * <name>`), so for UFC / Boxing / K-1 / Bellator events we have to do an
 * extra lookup per fighter — but only once. This module wraps that lookup
 * with a persistent cache so:
 *   • Repeat lookups for the same fighter (Conor McGregor across many
 *     events) cost zero SDB credits.
 *   • Misses are cached negatively for 7 days so an unranked debut doesn't
 *     burn one SDB call per nightly sync.
 *   • Hits are refreshed every 90 days in case SDB updates the cutout
 *     (rare, but happens after big walkout redesigns).
 *
 * Names come from `parseHeadlinerFromTitle` (api-sports-adapter.ts) so they
 * are already trimmed and stripped of event prefixes. We normalize once
 * more here (lowercase, collapse whitespace) for the cache key.
 */

export interface FighterImage {
  /** Always preferred over thumbUrl for cards — transparent PNG. */
  cutoutUrl: string | null;
  thumbUrl: string | null;
  idPlayer: string | null;
  team: string | null;
}

const HIT_TTL_MS = 90 * 24 * 60 * 60 * 1000;   // refresh hit metadata every 90d
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // re-try misses every 7d

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve a fighter's image URL, hitting SDB only when the cache row is
 * missing or stale. Returns null when SDB has no profile for the name.
 *
 * Callers MUST pass `sport` because the same string might be a Tennis
 * player (Maria Sharapova, Carlos Alcaraz). For combat we always pass
 * 'Fighting' which matches SDB's `strSport` field for the boxing / MMA
 * profiles.
 */
export async function getFighterImage(name: string, sport: string): Promise<FighterImage | null> {
  const nameKey = normalize(name);
  if (nameKey.length < 2) return null;

  const cached = await prisma.fighterImageCache.findUnique({ where: { nameKey } });
  const now = Date.now();
  if (cached) {
    const age = now - cached.lastFetchedAt.getTime();
    const ttl = cached.notFound ? MISS_TTL_MS : HIT_TTL_MS;
    if (age < ttl) {
      if (cached.notFound) return null;
      return {
        cutoutUrl: cached.cutoutUrl,
        thumbUrl: cached.thumbUrl,
        idPlayer: cached.idPlayer,
        team: cached.team,
      };
    }
  }

  // Cache miss / stale → ask SDB. Encode the name with a + separator
  // (SDB's convention) rather than %20 to maximise hit rate.
  let payload: { player?: Array<Record<string, unknown>> } | null = null;
  try {
    payload = await sportsDbFetch(`searchplayers.php?p=${encodeURIComponent(name).replace(/%20/g, '+')}`);
  } catch (err) {
    console.warn(`[FighterImages] SDB search failed for "${name}":`, err instanceof Error ? err.message : err);
    // Don't write the cache on transient errors — let the next sync retry.
    return null;
  }

  // Pick the first player whose strSport matches what we asked for.
  // SDB's search is fuzzy; for "Khabib" it returns hits from other sports
  // too, so a Fighting-typed filter avoids cross-discipline mismatches.
  const players = Array.isArray(payload?.player) ? payload.player : [];
  const match = players.find(p => typeof p.strSport === 'string' && p.strSport === sport) ?? null;

  if (!match) {
    // Negative cache: stop re-querying for the next MISS_TTL_MS.
    await prisma.fighterImageCache.upsert({
      where: { nameKey },
      create: {
        nameKey,
        displayName: name,
        sport,
        notFound: true,
        lastFetchedAt: new Date(),
      },
      update: {
        notFound: true,
        lastFetchedAt: new Date(),
      },
    });
    return null;
  }

  const cutoutUrl = typeof match.strCutout === 'string' && match.strCutout.length > 0 ? match.strCutout : null;
  const thumbUrl = typeof match.strThumb === 'string' && match.strThumb.length > 0 ? match.strThumb : null;
  const idPlayer = typeof match.idPlayer === 'string' ? match.idPlayer
    : typeof match.idPlayer === 'number' ? String(match.idPlayer) : null;
  const team = typeof match.strTeam === 'string' ? match.strTeam : null;

  await prisma.fighterImageCache.upsert({
    where: { nameKey },
    create: {
      nameKey,
      displayName: name,
      sport,
      idPlayer,
      team,
      thumbUrl,
      cutoutUrl,
      notFound: false,
      lastFetchedAt: new Date(),
    },
    update: {
      displayName: name,  // keep the casing fresh
      idPlayer,
      team,
      thumbUrl,
      cutoutUrl,
      notFound: false,
      lastFetchedAt: new Date(),
    },
  });

  return { cutoutUrl, thumbUrl, idPlayer, team };
}

/**
 * Resolve both fighter images for an event in one call. Returns them with
 * the field names `homeImage`/`awayImage` so the caller can plug them into
 * the existing `homeTeamCrest`/`awayTeamCrest` columns directly.
 */
export async function getEventFighterImages(
  homeName: string,
  awayName: string,
  sport: string,
): Promise<{ homeImage: string | null; awayImage: string | null }> {
  const [home, away] = await Promise.all([
    getFighterImage(homeName, sport),
    getFighterImage(awayName, sport),
  ]);
  // Prefer cutout (transparent png) over thumb (jpg headshot) for cards.
  return {
    homeImage: home?.cutoutUrl ?? home?.thumbUrl ?? null,
    awayImage: away?.cutoutUrl ?? away?.thumbUrl ?? null,
  };
}

/**
 * Sport codes that should trigger fighter-image enrichment. SDB groups
 * boxing / MMA / Muay Thai / K-1 / etc. under strSport='Fighting'; our
 * category codes for these vary (MMA, BOXIN, ...) so we key off the
 * adapter's strSport instead of the category code.
 */
export function isCombatSport(sportQuery: string | null | undefined): boolean {
  return sportQuery === 'Fighting';
}
