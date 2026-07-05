/**
 * LLM fallback for FINAL match results — used when TheSportsDB never records the
 * FT for a fixture (stale/missing data) and a sports pool is stuck. Uses
 * OpenAI's Responses API with the `web_search` tool so it can look up RECENT
 * results (plain chat-completions only knows its training cutoff).
 *
 * This only SUGGESTS a result for an admin to confirm; it never auto-resolves a
 * pool (LLMs can be wrong and payouts are irreversible). Scores are reported for
 * the EXACT team names we pass, in our order (homeScore = first team) — correct
 * regardless of which side the data source considers "home".
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

/** Pull the assistant text out of a Responses API payload. */
export function extractResponsesText(data: unknown): string {
  const root = (data ?? {}) as { output_text?: unknown; output?: unknown };
  if (typeof root.output_text === 'string' && root.output_text) return root.output_text;
  const out = root.output;
  if (!Array.isArray(out)) return '';
  let text = '';
  for (const item of out as Array<{ type?: unknown; content?: unknown }>) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content as Array<{ type?: unknown; text?: unknown }>) {
        if ((c?.type === 'output_text' || c?.type === 'text') && typeof c.text === 'string') text += c.text;
      }
    }
  }
  return text;
}

/** Extract the first JSON object from the model's text (handles ``` fences). */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

export async function fetchFinalResultFromChatGPT(p: {
  homeTeam: string;
  awayTeam: string;
  date: string;   // YYYY-MM-DD
  league: string;
}): Promise<LlmResultPayload> {
  const baseModel = 'gpt-4o-mini';
  const sent = { homeTeam: p.homeTeam, awayTeam: p.awayTeam, date: p.date, league: p.league };
  const apiKey = process.env.CHAT_GPT_API_KEY;
  if (!apiKey) return { sent, model: baseModel, result: null, error: 'CHAT_GPT_API_KEY not configured' };

  const prompt =
    `Search the web for the FINAL result of the match "${p.homeTeam}" vs "${p.awayTeam}" ` +
    `played on ${p.date} (${p.league}). Only report a score if the match has FINISHED and you ` +
    `found it on a reliable source. Respond ONLY with a JSON object: ` +
    `{ "homeScore": number, "awayScore": number, "finished": boolean, "confident": boolean, "note": "one short sentence including the source" }. ` +
    `homeScore is ${p.homeTeam}'s score, awayScore is ${p.awayTeam}'s score. ` +
    `If you cannot find it or it hasn't finished, set confident=false.`;

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: baseModel,
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
        max_output_tokens: 800,
      }),
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      return { sent, model: baseModel, result: null, error: `OpenAI ${res.status} ${res.statusText}${errTxt ? ' · ' + errTxt.slice(0, 200) : ''}` };
    }
    const data: unknown = await res.json();
    const text = extractResponsesText(data);
    if (!text) return { sent, model: `${baseModel} + web_search`, result: null, error: 'Empty response' };
    const parsed = extractJson(text);
    if (!parsed) return { sent, model: `${baseModel} + web_search`, result: null, error: `No JSON in response: ${text.slice(0, 160)}` };
    const result: LlmMatchResult = {
      homeScore: Number.isFinite(Number(parsed.homeScore)) ? Number(parsed.homeScore) : null,
      awayScore: Number.isFinite(Number(parsed.awayScore)) ? Number(parsed.awayScore) : null,
      finished: !!parsed.finished,
      confident: !!parsed.confident,
      note: typeof parsed.note === 'string' ? parsed.note : undefined,
    };
    return { sent, model: `${baseModel} + web_search`, result };
  } catch (e) {
    return { sent, model: baseModel, result: null, error: e instanceof Error ? e.message : String(e) };
  }
}
