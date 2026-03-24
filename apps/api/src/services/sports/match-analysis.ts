const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface H2HMatch {
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  competition: string;
}

/**
 * Fetch head-to-head data from football-data.org and generate analysis with Claude Haiku.
 * Returns cached-ready analysis text or null on failure.
 */
export async function generateMatchAnalysis(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
): Promise<string | null> {
  try {
    // 1. Fetch head2head from football-data.org
    const footballToken = process.env.FOOTBALL_DATA_API_KEY;
    if (!footballToken) return null;

    const h2hRes = await fetch(
      `https://api.football-data.org/v4/matches/${matchId}/head2head?limit=20`,
      { headers: { 'X-Auth-Token': footballToken } },
    );

    if (!h2hRes.ok) {
      console.warn(`[Analysis] Football API error: ${h2hRes.status}`);
      return null;
    }

    const h2hData = await h2hRes.json();
    const matches: H2HMatch[] = (h2hData.matches || []).map((m: any) => ({
      date: m.utcDate?.slice(0, 10) || '',
      home: m.homeTeam?.shortName || m.homeTeam?.name || '',
      away: m.awayTeam?.shortName || m.awayTeam?.name || '',
      homeScore: m.score?.fullTime?.home ?? 0,
      awayScore: m.score?.fullTime?.away ?? 0,
      competition: m.competition?.name || '',
    }));

    // Build context for Haiku
    const matchList = matches.length > 0
      ? matches.map(m => `${m.date}: ${m.home} ${m.homeScore}-${m.awayScore} ${m.away} (${m.competition})`).join('\n')
      : 'No previous encounters found in the database.';

    const totalMatches = matches.length;
    let homeWins = 0, awayWins = 0, draws = 0;
    for (const m of matches) {
      const isHome = m.home.toLowerCase().includes(homeTeam.toLowerCase().slice(0, 4));
      const homeGoals = isHome ? m.homeScore : m.awayScore;
      const awayGoals = isHome ? m.awayScore : m.homeScore;
      if (homeGoals > awayGoals) homeWins++;
      else if (awayGoals > homeGoals) awayWins++;
      else draws++;
    }

    // 2. Generate analysis with Claude Haiku
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return null;

    const prompt = `You are a football analyst. Give a brief, factual analysis of the upcoming match between ${homeTeam} and ${awayTeam}.

Head-to-head record (last ${totalMatches} meetings):
${homeTeam} wins: ${homeWins}, ${awayTeam} wins: ${awayWins}, Draws: ${draws}

Previous matches:
${matchList}

Write a concise analysis in 2-3 sentences. Include the head-to-head record, any notable patterns, and a brief assessment. Be factual, no predictions. Keep it under 80 words.`;

    const aiRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      console.warn(`[Analysis] Anthropic API error: ${aiRes.status}`);
      return null;
    }

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text?.trim();

    if (!text) return null;

    // Combine stats + analysis
    const summary = JSON.stringify({
      h2h: { total: totalMatches, homeWins, awayWins, draws },
      matches: matches.slice(0, 10).map(m => ({
        date: m.date,
        home: m.home,
        away: m.away,
        score: `${m.homeScore}-${m.awayScore}`,
      })),
      analysis: text,
    });

    console.log(`[Analysis] Generated for ${homeTeam} vs ${awayTeam}: ${text.slice(0, 80)}...`);
    return summary;
  } catch (error) {
    console.error(`[Analysis] Failed for ${homeTeam} vs ${awayTeam}:`, error);
    return null;
  }
}
