import { prisma } from '../../../db';

// ─── Types ───────────────────────────────────────────────────────────────────

export type IncidentType =
  | 'SPORTSDB_POLL_FAIL'
  | 'SPORTSDB_429'
  | 'EVENT_DISAPPEARED'
  | 'STUCK_NS'
  | 'SCORE_FROZEN'
  | 'CHATGPT_TRIGGERED'
  | 'CHATGPT_SUCCESS'
  | 'CHATGPT_REJECTED'
  | 'CHATGPT_ERROR'
  | 'ODDS_API_TRIGGERED'
  | 'ODDS_API_SUCCESS'
  | 'ODDS_API_REJECTED'
  | 'ODDS_API_ERROR'
  | 'MIDNIGHT_BOUNDARY';

export interface Incident {
  timestamp: number;
  type: IncidentType;
  eventId?: string;
  details: string;
}

export interface MissingEvent {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  missingSince: number;
  reason: string;
  chatgptAttempted: boolean;
}

export interface LivescoreMetrics {
  // Polling health
  lastPollAt: number | null;
  lastPollDurationMs: number;
  lastPollEventCount: number;
  consecutivePollFailures: number;
  lastPollError: string | null;

  // TheSportsDB health
  sportsDbSuccessCount: number;
  sportsDbFailureCount: number;
  sportsDbAvgLatencyMs: number;
  sportsDb429Count: number;

  // Fallback tracking
  lookupCallsTotal: number;
  chatgptCallsTotal: number;
  chatgptRejectionsTotal: number;
  chatgptCircuitBreakerOpen: boolean;
  oddsApiCallsTotal: number;
  oddsApiSuccessTotal: number;
  oddsApiCreditsRemaining: number | null;
  oddsApiDisabled: boolean;

  // ── Phase C source split (PLAN-LIVESCORE-SOURCE-SPLIT.md) ──
  // Cumulative per-row counters since the API started. Every persisted row
  // increments exactly one of these; reading their ratio tells the operator
  // how much work each feed is actually doing.
  displaySource: {
    sdb: number;        // SDB owned the row outright (Phase A)
    oddsApi: number;    // Odds API filled a gap SDB didn't cover
  };
  // Every FT signal counted exactly once: who flagged the match as finished
  // first. Tracked per resolved event so we can decide whether to keep the
  // \$60/mo Odds API plan after the 2-week soak (PLAN decision 3).
  ftSource: {
    sdb: number;             // SDB returned a finished strStatus
    oddsApiFallback: number; // Odds API completed:true overrode a lagging SDB row (Phase B grace path)
    chatgpt: number;         // ChatGPT last-resort fallback resolved
  };
  // Knockouts (CL/EL) that are past expected end but still waiting on SDB
  // AET/PEN — deliberately NOT overridden by Odds API per regulation rules.
  // Tracked as a current gauge (not cumulative); spikes mean SDB is behind.
  ftStuckKnockoutCount: number;

  // Active issues
  missingEvents: MissingEvent[];

  // Incident log (last 100)
  incidents: Incident[];
}

// ─── State ───────────────────────────────────────────────────────────────────

const MAX_INCIDENTS = 100;

let lastPollAt: number | null = null;
let lastPollDurationMs = 0;
let lastPollEventCount = 0;
let consecutivePollFailures = 0;
let lastPollError: string | null = null;

let sportsDbSuccessCount = 0;
let sportsDbFailureCount = 0;
let sportsDbTotalLatencyMs = 0;
let sportsDb429Count = 0;

let lookupCallsTotal = 0;

// Phase C source split counters
let displaySourceSdb = 0;
let displaySourceOddsApi = 0;
let ftSourceSdb = 0;
let ftSourceOddsApiFallback = 0;
let ftSourceChatGpt = 0;
let ftStuckKnockoutCount = 0;
// Track which event IDs we've already counted as "FT resolved" so the poller
// can call recordFtSource on every cycle without inflating the totals when
// the same row stays in toPersist for multiple cycles before resolve fires.
const ftCountedEvents = new Set<string>();

const missingEvents = new Map<string, MissingEvent>();
const incidents: Incident[] = [];

// ─── Record functions ────────────────────────────────────────────────────────

export function recordPollSuccess(eventCount: number, durationMs: number): void {
  lastPollAt = Date.now();
  lastPollDurationMs = durationMs;
  lastPollEventCount = eventCount;
  consecutivePollFailures = 0;
  lastPollError = null;
  sportsDbSuccessCount++;
  sportsDbTotalLatencyMs += durationMs;
}

export function recordPollFailure(error: string): void {
  lastPollAt = Date.now();
  consecutivePollFailures++;
  lastPollError = error;
  sportsDbFailureCount++;
  addIncident('SPORTSDB_POLL_FAIL', undefined, error);
}

export function recordSportsDb429(): void {
  sportsDb429Count++;
  addIncident('SPORTSDB_429', undefined, 'Rate limited (429)');
}

export function recordLookupCall(): void {
  lookupCallsTotal++;
}

export function recordEventDisappeared(eventId: string, homeTeam: string, awayTeam: string, sport: string): void {
  if (!missingEvents.has(eventId)) {
    missingEvents.set(eventId, {
      eventId,
      homeTeam,
      awayTeam,
      sport,
      missingSince: Date.now(),
      reason: 'DISAPPEARED',
      chatgptAttempted: false,
    });
  }
  addIncident('EVENT_DISAPPEARED', eventId, `${homeTeam} vs ${awayTeam}`);
}

export function recordStuckNS(eventId: string, homeTeam: string, awayTeam: string, sport: string): void {
  if (!missingEvents.has(eventId)) {
    missingEvents.set(eventId, {
      eventId,
      homeTeam,
      awayTeam,
      sport,
      missingSince: Date.now(),
      reason: 'STUCK_NS',
      chatgptAttempted: false,
    });
  }
  addIncident('STUCK_NS', eventId, `${homeTeam} vs ${awayTeam}`);
}

export function recordScoreFrozen(eventId: string, details: string): void {
  const existing = missingEvents.get(eventId);
  if (existing) {
    existing.reason = 'SCORE_FROZEN';
  }
  addIncident('SCORE_FROZEN', eventId, details);
}

export function recordChatGPTTriggered(eventId: string, details: string): void {
  const existing = missingEvents.get(eventId);
  if (existing) existing.chatgptAttempted = true;
  addIncident('CHATGPT_TRIGGERED', eventId, details);
}

export function recordChatGPTSuccess(eventId: string, details: string): void {
  missingEvents.delete(eventId); // Issue resolved
  addIncident('CHATGPT_SUCCESS', eventId, details);
}

export function recordChatGPTRejected(eventId: string, details: string): void {
  addIncident('CHATGPT_REJECTED', eventId, details);
}

export function recordChatGPTError(eventId: string, details: string): void {
  addIncident('CHATGPT_ERROR', eventId, details);
}

export function recordOddsApiTriggered(sportKey: string, details: string): void {
  addIncident('ODDS_API_TRIGGERED', sportKey, details);
}

export function recordOddsApiSuccess(eventId: string, details: string): void {
  missingEvents.delete(eventId);
  addIncident('ODDS_API_SUCCESS', eventId, details);
}

export function recordOddsApiRejected(sportKey: string, details: string): void {
  addIncident('ODDS_API_REJECTED', sportKey, details);
}

export function recordMidnightBoundary(): void {
  addIncident('MIDNIGHT_BOUNDARY', undefined, 'Switching to per-sport feeds');
}

/** Clear a missing event when it reappears in the feed or gets resolved */
export function clearMissingEvent(eventId: string): void {
  missingEvents.delete(eventId);
}

// ─── Phase C source-split recorders ──────────────────────────────────────────

/**
 * Tally each row persisted in a poll cycle. Called once per event id with
 * `'sdb'` when SDB owned the row, `'oddsApi'` when only Odds API had it.
 */
export function recordDisplaySource(source: 'sdb' | 'oddsApi'): void {
  if (source === 'sdb') displaySourceSdb++;
  else displaySourceOddsApi++;
}

/**
 * Tally the FIRST FT signal for an event. Idempotent: subsequent calls with
 * the same eventId are no-ops, so the poller can fire this every cycle.
 */
export function recordFtSource(eventId: string, source: 'sdb' | 'oddsApiFallback' | 'chatgpt'): void {
  if (ftCountedEvents.has(eventId)) return;
  ftCountedEvents.add(eventId);
  if (source === 'sdb') ftSourceSdb++;
  else if (source === 'oddsApiFallback') ftSourceOddsApiFallback++;
  else ftSourceChatGpt++;
  // Trim the dedupe set so it doesn't grow unboundedly. 5k events covers
  // weeks of activity; rotating to the most recent half preserves recency.
  if (ftCountedEvents.size > 5000) {
    const arr = [...ftCountedEvents].slice(-2500);
    ftCountedEvents.clear();
    for (const id of arr) ftCountedEvents.add(id);
  }
}

/**
 * Current snapshot of CL/EL pools waiting on SDB AET/PEN (Phase B Decision 2:
 * knockouts never accept the Odds API FT fallback because Odds API can't tell
 * us if ET happened, and regulation-time bets resolve to DRAW for AET/PEN).
 * Called from the poller with the count for this cycle.
 */
export function recordFtStuckKnockoutCount(count: number): void {
  ftStuckKnockoutCount = count;
}

// ─── Get metrics snapshot ────────────────────────────────────────────────────

export function getMetrics(): LivescoreMetrics {
  // Import chatgpt stats dynamically to avoid circular deps
  let chatgptCalls = 0;
  let chatgptRejections = 0;
  let chatgptCircuitOpen = false;
  try {
    const chatgpt = require('./chatgpt-source');
    chatgptCalls = chatgpt.chatgptCallsTotal || 0;
    chatgptRejections = chatgpt.chatgptRejectionsTotal || 0;
    chatgptCircuitOpen = chatgpt.isChatGPTCircuitOpen?.() || false;
  } catch { /* not yet loaded */ }

  let oddsApiCalls = 0;
  let oddsApiSuccess = 0;
  let oddsApiRemaining: number | null = null;
  let oddsApiOff = false;
  try {
    const odds = require('./odds-api-source');
    oddsApiCalls = odds.oddsApiCallsTotal || 0;
    oddsApiSuccess = odds.oddsApiSuccessTotal || 0;
    oddsApiRemaining = odds.oddsApiCreditsRemaining;
    oddsApiOff = odds.isOddsApiDisabled?.() || false;
  } catch { /* not yet loaded */ }

  const totalCalls = sportsDbSuccessCount + sportsDbFailureCount;

  return {
    lastPollAt,
    lastPollDurationMs,
    lastPollEventCount,
    consecutivePollFailures,
    lastPollError,

    sportsDbSuccessCount,
    sportsDbFailureCount,
    sportsDbAvgLatencyMs: totalCalls > 0 ? Math.round(sportsDbTotalLatencyMs / totalCalls) : 0,
    sportsDb429Count,

    lookupCallsTotal,
    chatgptCallsTotal: chatgptCalls,
    chatgptRejectionsTotal: chatgptRejections,
    chatgptCircuitBreakerOpen: chatgptCircuitOpen,
    oddsApiCallsTotal: oddsApiCalls,
    oddsApiSuccessTotal: oddsApiSuccess,
    oddsApiCreditsRemaining: oddsApiRemaining,
    oddsApiDisabled: oddsApiOff,

    displaySource: {
      sdb: displaySourceSdb,
      oddsApi: displaySourceOddsApi,
    },
    ftSource: {
      sdb: ftSourceSdb,
      oddsApiFallback: ftSourceOddsApiFallback,
      chatgpt: ftSourceChatGpt,
    },
    ftStuckKnockoutCount,

    missingEvents: [...missingEvents.values()],
    incidents: [...incidents],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addIncident(type: IncidentType, eventId: string | undefined, details: string): void {
  incidents.push({ timestamp: Date.now(), type, eventId, details });

  // Ring buffer: keep last 100
  if (incidents.length > MAX_INCIDENTS) {
    incidents.splice(0, incidents.length - MAX_INCIDENTS);
  }

  // Persist critical incidents to EventLog (survives restart)
  const critical: IncidentType[] = ['SPORTSDB_POLL_FAIL', 'SPORTSDB_429', 'CHATGPT_TRIGGERED', 'CHATGPT_SUCCESS', 'CHATGPT_ERROR', 'ODDS_API_TRIGGERED', 'ODDS_API_SUCCESS'];
  if (critical.includes(type)) {
    prisma.eventLog.create({
      data: {
        eventType: 'LIVESCORE_INCIDENT',
        entityType: 'livescore',
        entityId: eventId || 'system',
        payload: { type, details, timestamp: Date.now() } as any,
      },
    }).catch(() => {});
  }
}
