import { sportsDbFetch } from './api-sports-fetch';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ── H2H from TheSportsDB ──────────────────────────────────────────────────

interface H2HMatch {
  date: string;
  home: string;
  away: string;
  score: string;
  homeScore: number;
  awayScore: number;
}

function toSearchName(team: string): string {
  return team.replace(/\s+/g, '_');
}

async function fetchH2HFromSportsDb(
  homeTeam: string,
  awayTeam: string,
): Promise<H2HMatch[]> {
  const homeKey = toSearchName(homeTeam);
  const awayKey = toSearchName(awayTeam);

  // Fetch both directions (home/away swap in different venues)
  const [dataAB, dataBA] = await Promise.all([
    sportsDbFetch(`searchevents.php?e=${homeKey}_vs_${awayKey}`).catch(() => null),
    sportsDbFetch(`searchevents.php?e=${awayKey}_vs_${homeKey}`).catch(() => null),
  ]);

  const eventsAB = dataAB?.event || [];
  const eventsBA = dataBA?.event || [];
  const all = [...eventsAB, ...eventsBA];

  const seenId = new Set<string>();
  const seenDateTeams = new Set<string>(); // dedup same match listed with different IDs
  const matches: H2HMatch[] = [];

  for (const e of all) {
    if (!e.idEvent || seenId.has(e.idEvent)) continue;
    seenId.add(e.idEvent);

    // Only include finished games with scores
    const status = (e.strStatus || '').toLowerCase();
    const finished = status === 'match finished' || status === 'ft' || status === 'finished' || status === 'aet' || status === 'ap';
    if (!finished) continue;

    const hs = Number(e.intHomeScore);
    const as = Number(e.intAwayScore);
    if (isNaN(hs) || isNaN(as)) continue;

    // Dedup by date + teams (same match can appear with different IDs in both search directions)
    const teams = [e.strHomeTeam, e.strAwayTeam].sort().join('|').toLowerCase();
    const dateKey = `${e.dateEvent}:${teams}`;
    if (seenDateTeams.has(dateKey)) continue;
    seenDateTeams.add(dateKey);

    matches.push({
      date: e.dateEvent || '',
      home: e.strHomeTeam || '',
      away: e.strAwayTeam || '',
      score: `${hs}-${as}`,
      homeScore: hs,
      awayScore: as,
    });
  }

  // Sort by date descending (most recent first)
  matches.sort((a, b) => b.date.localeCompare(a.date));

  return matches.slice(0, 10);
}

function computeH2HStats(matches: H2HMatch[], homeTeam: string, awayTeam: string) {
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;

  for (const m of matches) {
    const isHomeTeamHome = m.home.toLowerCase() === homeTeam.toLowerCase();
    if (m.homeScore > m.awayScore) {
      if (isHomeTeamHome) homeWins++;
      else awayWins++;
    } else if (m.awayScore > m.homeScore) {
      if (isHomeTeamHome) awayWins++;
      else homeWins++;
    } else {
      draws++;
    }
  }

  return { total: matches.length, homeWins, awayWins, draws };
}

// ── Analysis text via ChatGPT (fed with real data) ────────────────────────

async function generateAnalysisText(
  homeTeam: string,
  awayTeam: string,
  h2h: { total: number; homeWins: number; awayWins: number; draws: number },
  recentMatches: H2HMatch[],
  league?: string,
): Promise<string> {
  const apiKey = process.env.CHAT_GPT_API_KEY;
  if (!apiKey) return '';

  const matchList = recentMatches.slice(0, 5).map(m =>
    `${m.date}: ${m.home} ${m.score} ${m.away}`
  ).join('\n');

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 150,
      messages: [
        {
          role: 'system',
          content: `You are a concise sports analyst. Write factual analysis ONLY based on the data provided. Never invent statistics.`,
        },
        {
          role: 'user',
          content: `${homeTeam} vs ${awayTeam} (${league || 'sports'}).

H2H record (last ${h2h.total} meetings): ${homeTeam} ${h2h.homeWins}W, Draws ${h2h.draws}, ${awayTeam} ${h2h.awayWins}W.

Recent matches:
${matchList || 'No recent data available.'}

Write 2-3 sentences of factual analysis based ONLY on this data. Focus on the H2H trend and recent form. Under 80 words.`,
        },
      ],
    }),
  });

  if (!res.ok) return '';

  const data: any = await res.json();
  return (data.choices?.[0]?.message?.content?.trim()) || '';
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate match analysis with real H2H data from TheSportsDB
 * and optional ChatGPT analysis text based on that real data.
 */
export async function generateMatchAnalysis(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  league?: string,
): Promise<string | null> {
  try {
    // 1. Fetch real H2H data
    const recentMatches = await fetchH2HFromSportsDb(homeTeam, awayTeam);

    if (recentMatches.length === 0) {
      console.log(`[Analysis] No H2H data found for ${homeTeam} vs ${awayTeam}`);
      return null;
    }

    // 2. Compute stats from real data
    const h2h = computeH2HStats(recentMatches, homeTeam, awayTeam);

    // 3. Format matches for frontend
    const matches = recentMatches.map(m => ({
      date: m.date,
      home: m.home,
      away: m.away,
      score: m.score,
    }));

    // 4. Generate analysis text (non-critical — real data is the priority)
    let analysis = '';
    try {
      analysis = await generateAnalysisText(homeTeam, awayTeam, h2h, recentMatches, league);
    } catch {
      analysis = `${h2h.total} meetings: ${homeTeam} ${h2h.homeWins}W, ${awayTeam} ${h2h.awayWins}W, ${h2h.draws}D.`;
    }

    if (!analysis) {
      analysis = `${h2h.total} meetings: ${homeTeam} ${h2h.homeWins}W, ${awayTeam} ${h2h.awayWins}W, ${h2h.draws}D.`;
    }

    const summary = JSON.stringify({ h2h, matches, analysis });
    console.log(`[Analysis] H2H for ${homeTeam} vs ${awayTeam}: ${h2h.homeWins}-${h2h.draws}-${h2h.awayWins} (${h2h.total} matches)`);
    return summary;
  } catch (error) {
    console.error(`[Analysis] Failed for ${homeTeam} vs ${awayTeam}:`, error);
    return null;
  }
}
