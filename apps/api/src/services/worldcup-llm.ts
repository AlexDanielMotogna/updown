import { extractResponsesText, extractJson } from './sports/llm-result';

/**
 * ChatGPT fallback for a finished World Cup match: the score at the end of normal/extra
 * time, how it was decided (regulation / extra time / penalties), and — when it went to a
 * shootout — the penalty score that SDB usually doesn't expose. Only SUGGESTS a result for
 * the admin to confirm (LLMs can be wrong and this feeds contest payouts).
 */

export type WcPhase = 'REGULATION' | 'EXTRA_TIME' | 'PENALTIES';

export interface WcLlmResult {
  homeScore: number | null; // score at the end of regulation/ET (before any shootout)
  awayScore: number | null;
  phase: WcPhase | null;
  homePens: number | null; // penalty shootout score, only when phase === PENALTIES
  awayPens: number | null;
  confident: boolean;
  note?: string;
}

export interface WcLlmPayload {
  sent: { homeTeam: string; awayTeam: string; date: string };
  model: string;
  result: WcLlmResult | null;
  error?: string;
}

const asNum = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Number(v) : null);
const asPhase = (v: unknown): WcPhase | null => {
  const s = String(v ?? '').toUpperCase();
  return s === 'PENALTIES' || s === 'EXTRA_TIME' || s === 'REGULATION' ? (s as WcPhase) : null;
};

export async function fetchWorldCupResultFromChatGPT(p: { homeTeam: string; awayTeam: string; date: string }): Promise<WcLlmPayload> {
  const model = 'gpt-4o-mini';
  const sent = { homeTeam: p.homeTeam, awayTeam: p.awayTeam, date: p.date };
  const apiKey = process.env.CHAT_GPT_API_KEY;
  if (!apiKey) return { sent, model, result: null, error: 'CHAT_GPT_API_KEY not configured' };

  const prompt =
    `Search the web for the FINAL result of the FIFA World Cup match "${p.homeTeam}" vs "${p.awayTeam}" played on ${p.date}. ` +
    `Report the score at the end of normal or extra time (NOT counting the penalty shootout), how the match was decided, ` +
    `and if it went to penalties, the penalty shootout score. Respond ONLY with JSON: ` +
    `{ "homeScore": number, "awayScore": number, "phase": "REGULATION" | "EXTRA_TIME" | "PENALTIES", ` +
    `"homePens": number | null, "awayPens": number | null, "confident": boolean, "note": "one short sentence with the source" }. ` +
    `homeScore/homePens are for ${p.homeTeam}; awayScore/awayPens are for ${p.awayTeam}. ` +
    `Set homePens/awayPens to null unless phase is PENALTIES. If you cannot find it or it has not finished, set confident=false.`;

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, tools: [{ type: 'web_search_preview' }], input: prompt, max_output_tokens: 800 }),
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      return { sent, model, result: null, error: `OpenAI ${res.status} ${res.statusText}${errTxt ? ' · ' + errTxt.slice(0, 200) : ''}` };
    }
    const text = extractResponsesText(await res.json());
    if (!text) return { sent, model: `${model} + web_search`, result: null, error: 'Empty response' };
    const parsed = extractJson(text);
    if (!parsed) return { sent, model: `${model} + web_search`, result: null, error: `No JSON in response: ${text.slice(0, 160)}` };
    const phase = asPhase(parsed.phase);
    const result: WcLlmResult = {
      homeScore: asNum(parsed.homeScore),
      awayScore: asNum(parsed.awayScore),
      phase,
      homePens: phase === 'PENALTIES' ? asNum(parsed.homePens) : null,
      awayPens: phase === 'PENALTIES' ? asNum(parsed.awayPens) : null,
      confident: !!parsed.confident,
      note: typeof parsed.note === 'string' ? parsed.note : undefined,
    };
    return { sent, model: `${model} + web_search`, result };
  } catch (e) {
    return { sent, model, result: null, error: e instanceof Error ? e.message : String(e) };
  }
}
