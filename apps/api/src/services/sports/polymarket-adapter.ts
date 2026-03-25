import { SportAdapter, Match, MatchResult } from './types';
import { polymarketFetch } from './polymarket-fetch';

// ── Category configuration ──────────────────────────────────────────────────

export interface PolymarketCategory {
  code: string;        // league code in DB: PM_POLITICS, PM_GEO, etc.
  name: string;        // UI label
  tags: string[];      // Polymarket event tags that match this category
  minVolume24h: number; // minimum 24h volume in USD to qualify
  maxDaysAhead: number; // how far ahead to create pools (days)
}

export const PM_CATEGORIES: PolymarketCategory[] = [
  {
    code: 'PM_FINANCE',
    name: 'Finance & Economy',
    tags: ['Business', 'Commodities', 'Economics', 'Gold', 'Oil', 'Stocks'],
    minVolume24h: 10_000,
    maxDaysAhead: 60,
  },
  {
    code: 'PM_POLITICS',
    name: 'Politics',
    tags: ['Politics', 'Elections', 'Global Elections'],
    minVolume24h: 10_000,
    maxDaysAhead: 1100, // Political markets can be years ahead (e.g. 2028 elections)
  },
  {
    code: 'PM_GEO',
    name: 'Geopolitics',
    tags: ['Geopolitics', 'Middle East'],
    minVolume24h: 10_000,
    maxDaysAhead: 90,
  },
  {
    code: 'PM_CULTURE',
    name: 'Culture & Entertainment',
    tags: ['Culture', 'Entertainment', 'Pop Culture'],
    minVolume24h: 5_000,
    maxDaysAhead: 180,
  },
];

const MAX_PER_CATEGORY = Number(process.env.POLYMARKET_MAX_MARKETS_PER_CATEGORY) || 10;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Match an event's tags to one of our categories (first match wins). */
export function categorizeEvent(eventTags: Array<{ label?: string; slug?: string }>): PolymarketCategory | null {
  const labels = new Set(eventTags.map(t => t.label).filter(Boolean));
  for (const cat of PM_CATEGORIES) {
    if (cat.tags.some(tag => labels.has(tag))) return cat;
  }
  return null;
}

function safeJsonParse<T>(str: string | null | undefined): T | null {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

interface GammaMarket {
  id: string;
  question: string;
  description?: string;
  outcomes: string;          // JSON string: '["Yes","No"]'
  outcomePrices: string;     // JSON string: '["0.6","0.4"]'
  endDate: string;
  active: boolean;
  closed: boolean;
  umaResolutionStatus?: string | null;
  volume24hr?: number;
}

interface GammaEvent {
  id: string;
  title: string;
  description?: string;
  volume24hr?: number;
  active: boolean;
  closed: boolean;
  tags?: Array<{ label?: string; slug?: string }>;
  markets?: GammaMarket[];
}

function marketToMatch(market: GammaMarket, category: PolymarketCategory, eventTitle?: string): Match | null {
  const outcomes = safeJsonParse<string[]>(market.outcomes);
  if (!outcomes || outcomes.length < 2) return null;

  const endDate = new Date(market.endDate);
  if (isNaN(endDate.getTime())) return null;

  // For generic Yes/No markets, use market question (specific) as homeTeam
  const isGenericYesNo = outcomes[0] === 'Yes' && outcomes[1] === 'No';
  const questionTitle = market.question || eventTitle || 'Prediction';

  return {
    id: market.id,
    sport: 'POLYMARKET',
    league: category.code,
    leagueName: category.name,
    homeTeam: isGenericYesNo ? questionTitle : outcomes[0],
    awayTeam: isGenericYesNo ? '' : outcomes[1],
    kickoff: endDate,
    status: 'SCHEDULED',
  };
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class PolymarketAdapter implements SportAdapter {
  sport = 'POLYMARKET';
  numSides = 2;
  sideLabels = ['Yes', 'No'];

  /**
   * Fetch upcoming markets for a given category code (e.g. 'PM_POLITICS').
   * Fetches top events by volume from Gamma API, filters client-side by category tags.
   */
  async fetchUpcomingMatches(category: string): Promise<Match[]> {
    const cat = PM_CATEGORIES.find(c => c.code === category);
    if (!cat) return [];

    const events: GammaEvent[] = await polymarketFetch(
      '/events?active=true&closed=false&order=volume&ascending=false&limit=200',
    );

    const matches: Match[] = [];

    for (const event of events) {
      if (matches.length >= MAX_PER_CATEGORY) break;

      // Must have tags that match this specific category
      const eventCat = categorizeEvent(event.tags ?? []);
      if (!eventCat || eventCat.code !== category) continue;

      // Volume filter
      if ((event.volume24hr ?? 0) < cat.minVolume24h) continue;

      // For multi-market events, take up to 5 sub-markets
      const markets = event.markets ?? [];
      const marketsToProcess = markets.length === 1 ? markets : markets.slice(0, 5);

      for (const market of marketsToProcess) {
        if (matches.length >= MAX_PER_CATEGORY) break;
        const match = marketToMatch(market, cat, event.title);
        if (match) matches.push(match);
      }
    }

    return matches;
  }

  /**
   * Fetch a single market result by Gamma market ID.
   * Returns MatchResult only if the market is fully resolved.
   */
  async fetchMatchResult(marketId: string): Promise<MatchResult | null> {
    // Gamma returns an array when querying by id
    const data = await polymarketFetch(`/markets?id=${marketId}`);
    const market: GammaMarket | undefined = Array.isArray(data) ? data[0] : data;
    if (!market) return null;

    // Must be closed AND resolved via UMA
    if (!market.closed || market.umaResolutionStatus !== 'resolved') return null;

    const prices = safeJsonParse<string[]>(market.outcomePrices);
    if (!prices || prices.length < 2) return null;

    // Winner is the outcome with price "1" (or closest to 1)
    const price0 = parseFloat(prices[0]);
    const price1 = parseFloat(prices[1]);

    let winner: 'HOME' | 'AWAY';
    let homeScore: number;
    let awayScore: number;

    if (price0 > price1) {
      winner = 'HOME';
      homeScore = 1;
      awayScore = 0;
    } else {
      winner = 'AWAY';
      homeScore = 0;
      awayScore = 1;
    }

    return {
      matchId: market.id,
      status: 'FINISHED',
      homeScore,
      awayScore,
      winner,
    };
  }

  /**
   * Fetch markets in a date range for a category.
   * Used by the bulk sync to populate fixture cache.
   */
  async fetchMatchesByDateRange(category: string, _dateFrom: string, _dateTo: string): Promise<Match[]> {
    // Gamma API doesn't support date range filtering, so we fetch all active
    // and filter by endDate client-side
    const cat = PM_CATEGORIES.find(c => c.code === category);
    if (!cat) return [];

    const events: GammaEvent[] = await polymarketFetch(
      '/events?active=true&closed=false&order=volume&ascending=false&limit=200',
    );

    const from = new Date(_dateFrom);
    const to = new Date(_dateTo);
    const matches: Match[] = [];

    for (const event of events) {
      if (matches.length >= MAX_PER_CATEGORY) break;

      const eventCat = categorizeEvent(event.tags ?? []);
      if (!eventCat || eventCat.code !== category) continue;
      if ((event.volume24hr ?? 0) < cat.minVolume24h) continue;

      const market = event.markets?.[0];
      if (!market) continue;

      // Date range filter
      const endDate = new Date(market.endDate);
      if (endDate < from || endDate > to) continue;

      const match = marketToMatch(market, cat, event.title);
      if (match) matches.push(match);
    }

    return matches;
  }

  /**
   * Resolve winner from a MatchResult.
   * HOME (outcome 0 / "Yes") = 0 → Side::UP
   * AWAY (outcome 1 / "No")  = 1 → Side::DOWN
   */
  resolveWinner(result: MatchResult): number {
    return result.winner === 'HOME' ? 0 : 1;
  }
}
