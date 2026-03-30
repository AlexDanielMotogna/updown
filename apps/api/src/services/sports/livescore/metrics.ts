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

export function recordMidnightBoundary(): void {
  addIncident('MIDNIGHT_BOUNDARY', undefined, 'Switching to per-sport feeds');
}

/** Clear a missing event when it reappears in the feed or gets resolved */
export function clearMissingEvent(eventId: string): void {
  missingEvents.delete(eventId);
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
  const critical: IncidentType[] = ['SPORTSDB_POLL_FAIL', 'SPORTSDB_429', 'CHATGPT_TRIGGERED', 'CHATGPT_SUCCESS', 'CHATGPT_ERROR'];
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
