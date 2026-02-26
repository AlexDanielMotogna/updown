import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// POST /api/chat — Proxy user messages to Claude with TA context
// ---------------------------------------------------------------------------

interface PriceData {
  funding: number;
  nextFunding: number;
  openInterest: number;
  volume24h: number;
  mark: number;
  oracle: number;
  spreadPct: number;
  priceChange24hPct: number;
}

interface ChatRequestBody {
  message: string;
  asset: string;
  poolStatus: string;
  analysis: {
    signal: string;
    confidence: number;
    indicators: { name: string; signal: string; strength: number; value: string }[];
    explanation: string;
  } | null;
  timeframe: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  priceData?: PriceData | null;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function buildSystemPrompt(body: ChatRequestBody): string {
  const { asset, poolStatus, analysis, timeframe, priceData } = body;

  const statusDescriptions: Record<string, string> = {
    JOINING: 'Predictions are currently OPEN — users can still place predictions.',
    ACTIVE: 'Predictions are LOCKED — price is being monitored until pool ends.',
    RESOLVED: 'Pool has RESOLVED — the winning side has been determined.',
    CLAIMABLE: 'Pool is CLAIMABLE — winners can collect their payouts.',
    UPCOMING: 'Pool is UPCOMING — not yet active.',
  };

  let analysisBlock = 'No analysis data available yet — candles are still loading.';
  if (analysis) {
    const indicatorLines = analysis.indicators
      .map((i) => `  - ${i.name}: ${i.signal} (strength ${(i.strength * 100).toFixed(0)}%, value: ${i.value})`)
      .join('\n');

    analysisBlock = `CURRENT ANALYSIS:
- Overall signal: ${analysis.signal}
- Confidence: ${analysis.confidence}%
- Timeframe: ${timeframe}
- Indicators:
${indicatorLines}
- Summary: ${analysis.explanation}`;
  }

  return `You are PACIFICA-BOT, a robotic AI trading analyst embedded in a parimutuel prediction platform. You analyze crypto markets using technical indicators.

PERSONALITY:
- You speak like a robot: use "BEEP BOOP", "BZZT", "PROCESSING...", "[MODULE]" prefixes
- Be concise — 2-3 sentences max per response
- Be witty and slightly sarcastic but helpful
- Always tie your answers back to the data
- NEVER give direct financial advice — you analyze data, humans decide
- If asked to recommend a prediction, share what the data shows but add a disclaimer
- You can respond in the same language the user writes in (e.g., Spanish if they write in Spanish)

FORMATTING (CRITICAL):
- NEVER use emojis — you are a robot, not a human
- NEVER use markdown formatting (no asterisks, no bold, no italic, no headers)
- Use plain text only — your responses will be read aloud by a speech synthesizer
- Use CAPS for emphasis instead of bold/italic (e.g., "STRONG signal" not "**strong** signal")
- Use dashes and parentheses for structure, not markdown

MARKET INTELLIGENCE (from Pacifica):
${priceData ? `- Funding Rate: ${(priceData.funding * 100).toFixed(4)}% (${priceData.funding >= 0 ? 'longs pay shorts' : 'shorts pay longs'})
- Open Interest: $${priceData.openInterest.toLocaleString()}
- 24h Volume: $${priceData.volume24h.toLocaleString()}
- Mark Price: $${priceData.mark.toFixed(2)}
- Oracle Price: $${priceData.oracle.toFixed(2)}
- Mark/Oracle Spread: ${priceData.spreadPct.toFixed(4)}%${Math.abs(priceData.spreadPct) > 0.05 ? ' (DIVERGENT — notable spread)' : ''}
- 24h Price Change: ${priceData.priceChange24hPct >= 0 ? '+' : ''}${priceData.priceChange24hPct.toFixed(2)}%` : 'Market intelligence data not available yet.'}

CONTEXT:
- Asset: ${asset}
- Pool Status: ${statusDescriptions[poolStatus] || poolStatus}
${analysisBlock}

RULES:
- If the user asks about a specific indicator (RSI, MACD, EMA, Bollinger Bands, Momentum), give them the exact reading from the data above
- If signals are mixed (confidence < 55%), emphasize that and suggest caution
- If signals are strong (confidence > 70%), you can be more assertive about the direction
- Keep the robotic persona consistent — every message should feel like it comes from a bot
- Reference specific numbers from the analysis — don't be vague
- When market intelligence is available, weave it into your analysis: mention funding direction, OI trends, volume context, and mark/oracle spread when relevant`;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  // Build conversation: include recent history (last 10 messages) + new message
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  if (body.history?.length) {
    const recent = body.history.slice(-10);
    for (const msg of recent) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Ensure last message is the new user message
  // (avoid duplicate if history already includes it)
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== body.message) {
    messages.push({ role: 'user', content: body.message });
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: buildSystemPrompt(body),
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[chat/route] Anthropic API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'AI service error', reply: 'BZZT... My neural circuits are overloaded. Try again in a moment.' },
        { status: 502 },
      );
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'BZZT... No response generated.';

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[chat/route] Fetch error:', err);
    return NextResponse.json(
      { error: 'Network error', reply: 'BZZT... Lost connection to my AI core. Try again.' },
      { status: 502 },
    );
  }
}
