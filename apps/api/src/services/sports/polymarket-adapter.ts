import { SportAdapter, Match, MatchResult } from './types';
import { polymarketFetch } from './polymarket-fetch';
import { getPolymarketCategories, getDisabledPolymarketTags, type PolymarketCategoryConfig } from '../category-config';

// Re-export for backward compat
export type PolymarketCategory = PolymarketCategoryConfig;

const MAX_PER_CATEGORY = Number(process.env.POLYMARKET_MAX_MARKETS_PER_CATEGORY) || 10;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Match an event's tags to one of our categories (first match wins).
 *  If any tag belongs to a disabled/comingSoon category, skip the event
 *  entirely to prevent miscategorization (e.g. "Sports" event landing in "Geopolitics"). */
export async function categorizeEvent(eventTags: Array<{ label?: string; slug?: string }>): Promise<PolymarketCategoryConfig | null> {
  const cats = await getPolymarketCategories();
  const labels = new Set(eventTags.map(t => t.label).filter((l): l is string => !!l));

  // Reject events that belong to a disabled category
  const disabledTags = await getDisabledPolymarketTags();
  for (const label of labels) {
    if (disabledTags.has(label)) return null;
  }

  for (const cat of cats) {
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
    const cats = await getPolymarketCategories();
    const cat = cats.find(c => c.code === category);
    if (!cat) return [];

    const events: GammaEvent[] = await polymarketFetch(
      '/events?active=true&closed=false&order=volume&ascending=false&limit=200',
    );

    const matches: Match[] = [];

    for (const event of events) {
      if (matches.length >= MAX_PER_CATEGORY) break;

      // Must have tags that match this specific category
      const eventCat = await categorizeEvent(event.tags ?? []);
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
    const cats = await getPolymarketCategories();
    const cat = cats.find(c => c.code === category);
    if (!cat) return [];

    const events: GammaEvent[] = await polymarketFetch(
      '/events?active=true&closed=false&order=volume&ascending=false&limit=200',
    );

    const from = new Date(_dateFrom);
    const to = new Date(_dateTo);
    const matches: Match[] = [];

    for (const event of events) {
      if (matches.length >= MAX_PER_CATEGORY) break;

      const eventCat = await categorizeEvent(event.tags ?? []);
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
