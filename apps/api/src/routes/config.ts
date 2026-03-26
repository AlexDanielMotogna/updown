import { Router, type Router as RouterType } from 'express';
import { getVisibleCategories } from '../services/category-config';
import { sportsDbFetch } from '../services/sports/api-sports-fetch';

export const configRouter: RouterType = Router();

// GET /api/config/categories — public, returns enabled + comingSoon categories
configRouter.get('/categories', async (_req, res) => {
  try {
    const categories = await getVisibleCategories();
    res.json({
      success: true,
      data: categories.map(c => ({
        code: c.code,
        type: c.type,
        enabled: c.enabled,
        comingSoon: c.comingSoon,
        label: c.label,
        shortLabel: c.shortLabel,
        color: c.color,
        badgeUrl: c.badgeUrl,
        iconKey: c.iconKey,
        numSides: c.numSides,
        sideLabels: c.sideLabels,
        sortOrder: c.sortOrder,
      })),
    });
  } catch {
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch categories' } });
  }
});

// GET /api/config/polymarket-tags?seeds=Culture,Entertainment — tags that co-occur with seed tags
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

// GET /api/config/sportsdb-sports — list available sports from TheSportsDB
configRouter.get('/sportsdb-sports', async (_req, res) => {
  try {
    const data = await sportsDbFetch('all_sports.php');
    const sports = (data?.sports || []).map((s: { strSport: string }) => s.strSport).filter(Boolean);
    res.json({ success: true, data: sports });
  } catch {
    res.json({ success: true, data: ['Soccer', 'Basketball', 'Ice Hockey', 'American Football', 'Fighting', 'Baseball', 'Motorsport', 'Tennis', 'Rugby', 'Cricket', 'Golf', 'ESports'] });
  }
});

// GET /api/config/sportsdb-leagues?sport=Basketball — list leagues for a sport
configRouter.get('/sportsdb-leagues', async (req, res) => {
  try {
    const sport = req.query.sport as string;
    if (!sport) return res.json({ success: true, data: [] });
    const data = await sportsDbFetch(`search_all_leagues.php?s=${encodeURIComponent(sport)}`);
    const leagues = (data?.countrys || data?.leagues || [])
      .map((l: { idLeague: string; strLeague: string }) => ({ id: l.idLeague, name: l.strLeague }))
      .filter((l: { name: string }) => l.name);
    res.json({ success: true, data: leagues });
  } catch {
    res.json({ success: true, data: [] });
  }
});
