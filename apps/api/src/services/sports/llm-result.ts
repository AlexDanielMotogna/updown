/**
 * LLM fallback for FINAL match results — used when TheSportsDB never records the
 * FT for a fixture (stale/missing data) and a sports pool is stuck. This only
 * SUGGESTS a result for an admin to confirm; it never auto-resolves a pool
 * (LLMs can hallucinate, and payouts are irreversible).
 *
 * Scores are reported for the EXACT team names we pass, in our order
 * (homeScore = first team) — so it's correct regardless of which side the
 * data source considers "home".
 */
export interface LlmMatchResult {
  homeScore: number | null;
  awayScore: number | null;
  finished: boolean;
  confident: boolean;
  note?: string;
}

export interface LlmResultPayload {
  sent: { homeTeam: string; awayTeam: string; date: string; league: string };
  model: string;
  result: LlmMatchResult | null;
  error?: string;
}

export async function fetchFinalResultFromChatGPT(p: {
  homeTeam: string;
  awayTeam: string;
  date: string;   // YYYY-MM-DD
  league: string;
}): Promise<LlmResultPayload> {
  const model = 'gpt-4o-mini';
  const sent = { homeTeam: p.homeTeam, awayTeam: p.awayTeam, date: p.date, league: p.league };
  const apiKey = process.env.CHAT_GPT_API_KEY;
  if (!apiKey) return { sent, model, result: null, error: 'CHAT_GPT_API_KEY not configured' };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content:
              'You report FINAL scores of finished matches. Only set "confident" to true if the match has FINISHED and you are certain of the exact final score. Never guess. "homeScore" is the goals/points of the FIRST team named, "awayScore" the SECOND, regardless of which is the venue host.',
          },
          {
            role: 'user',
            content:
              `Final score of the match "${p.homeTeam}" vs "${p.awayTeam}" played on ${p.date} (${p.league})? ` +
              `Return JSON: { "homeScore": number, "awayScore": number, "finished": boolean, "confident": boolean, "note": "one short sentence" }. ` +
              `homeScore = ${p.homeTeam}, awayScore = ${p.awayTeam}.`,
          },
        ],
      }),
    });
    if (!res.ok) return { sent, model, result: null, error: `OpenAI ${res.status} ${res.statusText}` };
    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return { sent, model, result: null, error: 'Empty response' };
    const parsed: any = JSON.parse(text);
    const result: LlmMatchResult = {
      homeScore: Number.isFinite(Number(parsed.homeScore)) ? Number(parsed.homeScore) : null,
      awayScore: Number.isFinite(Number(parsed.awayScore)) ? Number(parsed.awayScore) : null,
      finished: !!parsed.finished,
      confident: !!parsed.confident,
      note: typeof parsed.note === 'string' ? parsed.note : undefined,
    };
    return { sent, model, result };
  } catch (e) {
    return { sent, model, result: null, error: e instanceof Error ? e.message : String(e) };
  }
}
