import type { LiveScore } from './types';
import {
  CHATGPT_COOLDOWN_MS,
  CHATGPT_CIRCUIT_BREAKER_THRESHOLD,
  CHATGPT_CIRCUIT_BREAKER_COOLDOWN_MS,
} from './types';

// ─── State ───────────────────────────────────────────────────────────────────

const lastCallPerEvent = new Map<string, number>(); // eventId → timestamp
let consecutiveFailures = 0;
let circuitBreakerUntil = 0;

// ─── Exported state for metrics ──────────────────────────────────────────────

export let chatgptCallsTotal = 0;
export let chatgptRejectionsTotal = 0;

export function isChatGPTCircuitOpen(): boolean {
  return Date.now() < circuitBreakerUntil;
}

// ─── Response type ───────────────────────────────────────────────────────────

interface ChatGPTScoreResponse {
  homeScore: number;
  awayScore: number;
  status: string;       // 'LIVE' | 'FT' | 'HT' | 'UNKNOWN'
  confident: boolean;
  statusDetail?: string; // e.g. 'Q3 8:42', '2H 67\''
}

// ─── Core function ───────────────────────────────────────────────────────────

/**
 * Ask ChatGPT for the current/final score of a match.
 * Returns null if:
 *   - CHAT_GPT_API_KEY not configured
 *   - Cooldown not elapsed for this event
 *   - Circuit breaker is open
 *   - ChatGPT returns confident: false
 *   - Validation fails
 *   - Network/API error
 */
export async function fetchScoreFromChatGPT(
  eventId: string,
  homeTeam: string,
  awayTeam: string,
  sport: string,
  league: string,
  kickoffTime: Date,
  lastKnown: { homeScore: number; awayScore: number; status: string } | null,
): Promise<LiveScore | null> {
  const apiKey = process.env.CHAT_GPT_API_KEY;
  if (!apiKey) return null;

  // Per-event cooldown
  const lastCall = lastCallPerEvent.get(eventId) || 0;
  if (Date.now() - lastCall < CHATGPT_COOLDOWN_MS) return null;

  // Circuit breaker
  if (Date.now() < circuitBreakerUntil) return null;

  lastCallPerEvent.set(eventId, Date.now());
  chatgptCallsTotal++;

  try {
    const lastScoreStr = lastKnown
      ? `${lastKnown.homeScore}-${lastKnown.awayScore} (status: ${lastKnown.status})`
      : 'no previous data';

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: 'You are a sports score lookup assistant. Return ONLY a JSON object with the score of the requested match. If you don\'t know the current score or the match hasn\'t started yet, set "confident" to false. Never guess — only report scores you are certain about.',
          },
          {
            role: 'user',
            content: `What is the current or final score of the ${sport} match: ${homeTeam} vs ${awayTeam} (${league})? The match was scheduled to start at ${kickoffTime.toISOString()}. Our last known score was ${lastScoreStr}. Return JSON: { "homeScore": number, "awayScore": number, "status": "LIVE"|"FT"|"HT"|"UNKNOWN", "confident": boolean, "statusDetail": "optional string describing game state" }`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`[LiveScore:ChatGPT] API error: ${res.status} for ${homeTeam} vs ${awayTeam}`);
      recordFailure();
      return null;
    }

    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      recordFailure();
      return null;
    }

    const parsed: ChatGPTScoreResponse = JSON.parse(text);

    // ── Validation ──
    if (!parsed.confident) {
      console.log(`[LiveScore:ChatGPT] Rejected (not confident): ${homeTeam} vs ${awayTeam}`);
      chatgptRejectionsTotal++;
      recordSuccess(); // API worked, just no useful data
      return null;
    }

    if (parsed.status === 'UNKNOWN') {
      chatgptRejectionsTotal++;
      recordSuccess();
      return null;
    }

    if (parsed.homeScore < 0 || parsed.awayScore < 0) {
      console.warn(`[LiveScore:ChatGPT] Rejected (negative scores): ${parsed.homeScore}-${parsed.awayScore}`);
      chatgptRejectionsTotal++;
      recordSuccess();
      return null;
    }

    // Scores can't decrease
    if (lastKnown) {
      if (parsed.homeScore < lastKnown.homeScore || parsed.awayScore < lastKnown.awayScore) {
        console.warn(`[LiveScore:ChatGPT] Rejected (scores decreased): was ${lastKnown.homeScore}-${lastKnown.awayScore}, got ${parsed.homeScore}-${parsed.awayScore}`);
        chatgptRejectionsTotal++;
        recordSuccess();
        return null;
      }

      // Sanity: combined score can't jump by more than 10
      const prevTotal = lastKnown.homeScore + lastKnown.awayScore;
      const newTotal = parsed.homeScore + parsed.awayScore;
      if (newTotal - prevTotal > 10) {
        console.warn(`[LiveScore:ChatGPT] Rejected (score jump too large): ${prevTotal} → ${newTotal}`);
        chatgptRejectionsTotal++;
        recordSuccess();
        return null;
      }
    }

    // Map ChatGPT status to TheSportsDB-compatible status
    const mappedStatus = mapChatGPTStatus(parsed.status);
    const progress = parsed.statusDetail || '';

    console.log(`[LiveScore:ChatGPT] ${homeTeam} ${parsed.homeScore}-${parsed.awayScore} ${awayTeam} (${mappedStatus}${progress ? ' ' + progress : ''})`);
    recordSuccess();

    return {
      eventId,
      homeScore: parsed.homeScore,
      awayScore: parsed.awayScore,
      status: mappedStatus,
      progress,
      homeTeam,
      awayTeam,
      league,
      sport,
      homeTeamBadge: '',
      awayTeamBadge: '',
      updatedAt: Date.now(),
    };
  } catch (error) {
    console.warn(`[LiveScore:ChatGPT] Error for ${homeTeam} vs ${awayTeam}:`, (error as Error).message);
    recordFailure();
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapChatGPTStatus(status: string): string {
  switch (status.toUpperCase()) {
    case 'FT': return 'FT';
    case 'HT': return 'HT';
    case 'LIVE': return 'LIVE';
    default: return status;
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= CHATGPT_CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerUntil = Date.now() + CHATGPT_CIRCUIT_BREAKER_COOLDOWN_MS;
    console.warn(`[LiveScore:ChatGPT] Circuit breaker OPEN — disabled for 5 minutes after ${consecutiveFailures} consecutive failures`);
    consecutiveFailures = 0;
  }
}
