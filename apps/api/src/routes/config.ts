import { Router, type Router as RouterType } from 'express';
import { prisma } from '../db';
import { getVisibleCategories, getCategorySubcategories, getCategoryParentTags, isOperationalTag } from '../services/category-config';
import { sportsDbFetch } from '../services/sports/api-sports-fetch';
import { getRelatedTagsForMany, tagBySlug, getActiveTags } from '../services/sports/polymarket-tags';

export const configRouter: RouterType = Router();

// GET /api/config/categories - public, returns enabled + comingSoon categories
configRouter.get('/categories', async (_req, res) => {
  try {
    const categories = await getVisibleCategories();
    res.json({
      success: true,
      data: categories.map(c => {
        const cfg = c.config as Record<string, unknown> | null;
        return {
          code: c.code,
          type: c.type,
          enabled: c.enabled,
          comingSoon: c.comingSoon,
          label: c.label,
          shortLabel: c.shortLabel,
          color: c.color,
          badgeUrl: c.badgeUrl,
          badgeBgColor: c.badgeBgColor,
          iconKey: c.iconKey,
          numSides: c.numSides,
          sideLabels: c.sideLabels,
          sortOrder: c.sortOrder,
          // Hierarchy: parentCode points at a SPORT_GROUP. NULL means
          // top-level (group or legacy). Public filter uses this to nest
          // leagues under their sport umbrella.
          parentCode: c.parentCode,
          subcategories: Array.isArray(cfg?.subcategories) ? cfg.subcategories : [],
        };
      }),
    });
  } catch {
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch categories' } });
  }
});

// GET /api/config/polymarket-tags?seeds=Culture,Entertainment - tags that co-occur with seed tags
configRouter.get('/polymarket-tags', async (req, res) => {
  try {
    const seeds = (req.query.seeds as string || '').split(',').map(s => s.trim()).filter(Boolean);
    const r = await fetch('https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume&ascending=false&limit=200');
    const allEvents = await r.json() as Array<{ tags?: Array<{ label?: string }> }>;

    // If seeds provided, only look at events that have at least one seed tag
    const events = seeds.length > 0
      ? allEvents.filter(e => (e.tags || []).some(t => seeds.includes(t.label || '')))
      : allEvents;

    const counts: Record<string, number> = {};
    for (const e of events) {
      for (const t of (e.tags || [])) {
        if (t.label) counts[t.label] = (counts[t.label] || 0) + 1;
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
    res.json({ success: true, data: sorted, totalEvents: events.length });
  } catch {
    res.json({ success: true, data: [], totalEvents: 0 });
  }
});

// GET /api/config/pool-subcategories?league=PM_POLITICS
// Sidebar filters with live pool counts, in two passes:
//   1. CURATED - the category's admin-defined subcategory whitelist (keeps out
//      noise like the broad "Politics" tag, promo/automation tags, cross-category
//      tags), counted by TAG MEMBERSHIP. A pool counts toward EVERY curated tag it
//      carries (multi-tag) rather than one "winning" bucket, so filters are full
//      and no pool is lost to precedence. Returned in the admin's priority order.
//   2. FALLBACK - if the whitelist matches no pool (mislabeled or unconfigured),
//      auto-derive filters from the pools' REAL tags so the category still shows
//      useful, counted filters. Operational/promo junk and the broad parent tag
//      are excluded; results are ordered by frequency and capped.
// Either way only non-empty filters are returned.
configRouter.get('/pool-subcategories', async (req, res) => {
  try {
    const league = req.query.league as string;
    if (!league) return res.json({ success: true, data: [] });

    const order = await getCategorySubcategories(league); // curated labels, priority order
    const labelByLower = new Map(order.map(label => [label.toLowerCase(), label]));

    const pools = await prisma.pool.findMany({
      where: { league, tags: { not: null } },
      select: { tags: true },
    });

    // Pass 1 - curated whitelist facets.
    const counts: Record<string, number> = {};
    for (const p of pools) {
      try {
        const seen = new Set<string>();
        for (const t of JSON.parse(p.tags!) as string[]) {
          const label = labelByLower.get(String(t).trim().toLowerCase());
          if (label && !seen.has(label)) {
            counts[label] = (counts[label] || 0) + 1;
            seen.add(label); // count each pool once per tag
          }
        }
      } catch { /* skip malformed tag JSON */ }
    }

    let data = Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));

    // Pass 2 - fallback to real tags when the whitelist matched nothing.
    if (data.length === 0 && pools.length > 0) {
      const parents = new Set((await getCategoryParentTags(league)).map(t => t.trim().toLowerCase()));
      const raw: Record<string, number> = {};
      for (const p of pools) {
        try {
          const seen = new Set<string>();
          for (const t of JSON.parse(p.tags!) as string[]) {
            const label = String(t).trim();
            const lower = label.toLowerCase();
            if (!label || isOperationalTag(label) || parents.has(lower) || seen.has(lower)) continue;
            raw[label] = (raw[label] || 0) + 1;
            seen.add(lower); // count each pool once per tag
          }
        } catch { /* skip malformed tag JSON */ }
      }
      data = Object.entries(raw)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count) // most common first
        .slice(0, 12); // keep the sidebar tidy
    }

    res.json({ success: true, data });
  } catch {
    res.json({ success: true, data: [] });
  }
});

// GET /api/config/pool-counts → { [categoryCode]: number }
// Live pool count per category (by league code), so the admin sees at a glance
// which categories actually have pools.
configRouter.get('/pool-counts', async (_req, res) => {
  try {
    const grouped = await prisma.pool.groupBy({
      by: ['league'],
      where: { league: { not: null } },
      _count: { _all: true },
    });
    const data: Record<string, number> = {};
    for (const g of grouped) if (g.league) data[g.league] = g._count._all;
    res.json({ success: true, data });
  } catch {
    res.json({ success: true, data: {} });
  }
});

// GET /api/config/pool-tags?league=PM_POLITICS
// Admin suggestion source: raw tag labels found on a league's pools (operational
// tags filtered out), so the admin can pick which become curated subcategories.
configRouter.get('/pool-tags', async (req, res) => {
  try {
    const league = req.query.league as string;
    if (!league) return res.json({ success: true, data: [] });

    const pools = await prisma.pool.findMany({
      where: { league, tags: { not: null } },
      select: { tags: true },
    });

    const counts: Record<string, number> = {};
    for (const p of pools) {
      try {
        const tags: string[] = JSON.parse(p.tags!);
        for (const t of tags) {
          if (isOperationalTag(t)) continue;
          counts[t] = (counts[t] || 0) + 1;
        }
      } catch { /* skip */ }
    }

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));

    res.json({ success: true, data: sorted });
  } catch {
    res.json({ success: true, data: [] });
  }
});

// GET /api/config/pm-related-tags?tagIds=100265,154
// Polymarket's official ranked sub-tags for a category's parent tag(s) - the
// source for the admin "Sidebar Filters" picker (only real PM tags, no free text).
configRouter.get('/pm-related-tags', async (req, res) => {
  try {
    const tagIds = String(req.query.tagIds || '').split(',').map(s => s.trim()).filter(Boolean);
    if (tagIds.length === 0) return res.json({ success: true, data: [] });
    const data = await getRelatedTagsForMany(tagIds);
    res.json({ success: true, data });
  } catch {
    res.json({ success: true, data: [] });
  }
});

// GET /api/config/pm-tags?q=geo - Polymarket tags that appear on active events
// (clean, ranked, operational tags filtered). Source for the admin tag picker.
configRouter.get('/pm-tags', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    let tags = (await getActiveTags()).filter(t => !isOperationalTag(t.label));
    if (q) tags = tags.filter(t => t.label.toLowerCase().includes(q));
    res.json({ success: true, data: tags.slice(0, 80) });
  } catch {
    res.json({ success: true, data: [] });
  }
});

// GET /api/config/pm-tag?name=Geopolitics - resolve a typed category tag name to
// its Gamma tag_id (so the admin never types raw ids). Returns null if PM has none.
configRouter.get('/pm-tag', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name required' } });
    const tag = await tagBySlug(name);
    if (!tag) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `No Polymarket tag for "${name}"` } });
    res.json({ success: true, data: tag });
  } catch {
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to resolve tag' } });
  }
});

// GET /api/config/sportsdb-sports - list available sports from TheSportsDB
configRouter.get('/sportsdb-sports', async (_req, res) => {
  try {
    const data = await sportsDbFetch<{ sports?: Array<{ strSport: string }> }>('all_sports.php');
    const sports = (data?.sports || []).map((s: { strSport: string }) => s.strSport).filter(Boolean);
    res.json({ success: true, data: sports });
  } catch {
    res.json({ success: true, data: ['Soccer', 'Basketball', 'Ice Hockey', 'American Football', 'Fighting', 'Baseball', 'Motorsport', 'Tennis', 'Rugby', 'Cricket', 'Golf', 'ESports'] });
  }
});

// GET /api/config/sportsdb-leagues?sport=Basketball - list leagues for a sport
configRouter.get('/sportsdb-leagues', async (req, res) => {
  try {
    const sport = req.query.sport as string;
    if (!sport) return res.json({ success: true, data: [] });
    const data = await sportsDbFetch<{ countrys?: Array<{ idLeague: string; strLeague: string }>; leagues?: Array<{ idLeague: string; strLeague: string }> }>(`search_all_leagues.php?s=${encodeURIComponent(sport)}`);
    const leagues = (data?.countrys || data?.leagues || [])
      .map((l: { idLeague: string; strLeague: string }) => ({ id: l.idLeague, name: l.strLeague }))
      .filter((l: { name: string }) => l.name);
    res.json({ success: true, data: leagues });
  } catch {
    res.json({ success: true, data: [] });
  }
});
