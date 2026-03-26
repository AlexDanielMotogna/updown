import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CategorySeed {
  code: string;
  type: string;
  enabled: boolean;
  comingSoon: boolean;
  label: string;
  shortLabel?: string;
  color?: string;
  badgeUrl?: string;
  iconKey?: string;
  apiSource?: string;
  adapterKey?: string;
  numSides: number;
  sideLabels: string[];
  config?: Record<string, unknown>;
  sortOrder: number;
}

const CATEGORIES: CategorySeed[] = [
  // ── Football Leagues (enabled) ───────────────────────────────────────────
  {
    code: 'CL', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false,
    label: 'Champions League', shortLabel: 'UCL',
    badgeUrl: 'https://crests.football-data.org/CL.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 0,
  },
  {
    code: 'PL', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false,
    label: 'Premier League', shortLabel: 'Premier',
    badgeUrl: 'https://crests.football-data.org/PL.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 1,
  },
  {
    code: 'PD', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false,
    label: 'La Liga', shortLabel: 'La Liga',
    badgeUrl: 'https://crests.football-data.org/PD.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 2,
  },
  {
    code: 'SA', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false,
    label: 'Serie A', shortLabel: 'Serie A',
    badgeUrl: 'https://crests.football-data.org/SA.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 3,
  },
  {
    code: 'BL1', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false,
    label: 'Bundesliga', shortLabel: 'Bundesliga',
    badgeUrl: 'https://crests.football-data.org/BL1.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 4,
  },
  {
    code: 'FL1', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false,
    label: 'Ligue 1', shortLabel: 'Ligue 1',
    badgeUrl: 'https://crests.football-data.org/FL1.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 5,
  },
  {
    code: 'BSA', type: 'FOOTBALL_LEAGUE', enabled: true, comingSoon: false,
    label: 'Brasileirao', shortLabel: 'Brasileirao',
    badgeUrl: 'https://crests.football-data.org/bsa.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 6,
  },

  // ── Football Leagues (coming soon) ───────────────────────────────────────
  {
    code: 'ELC', type: 'FOOTBALL_LEAGUE', enabled: false, comingSoon: true,
    label: 'Championship', shortLabel: 'EFL',
    badgeUrl: 'https://crests.football-data.org/ELC.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 10,
  },
  {
    code: 'PPL', type: 'FOOTBALL_LEAGUE', enabled: false, comingSoon: true,
    label: 'Primeira Liga', shortLabel: 'Liga PT',
    badgeUrl: 'https://crests.football-data.org/PPL.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 11,
  },
  {
    code: 'DED', type: 'FOOTBALL_LEAGUE', enabled: false, comingSoon: true,
    label: 'Eredivisie', shortLabel: 'Eredivisie',
    badgeUrl: 'https://crests.football-data.org/DED.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 12,
  },
  {
    code: 'EL', type: 'FOOTBALL_LEAGUE', enabled: false, comingSoon: true,
    label: 'Europa League', shortLabel: 'UEL',
    badgeUrl: 'https://crests.football-data.org/EL.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 13,
  },
  {
    code: 'CLI', type: 'FOOTBALL_LEAGUE', enabled: false, comingSoon: true,
    label: 'Copa Libertadores', shortLabel: 'Libertadores',
    badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/9shr931685425181.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 14,
  },
  {
    code: 'WC', type: 'FOOTBALL_LEAGUE', enabled: false, comingSoon: true,
    label: 'World Cup', shortLabel: 'WC',
    badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/e7er5g1696521789.png',
    iconKey: 'SportsSoccer', apiSource: 'football-data', adapterKey: 'FOOTBALL',
    numSides: 3, sideLabels: ['Home', 'Draw', 'Away'], sortOrder: 15,
  },

  // ── TheSportsDB Sports (enabled) ─────────────────────────────────────────
  {
    code: 'NBA', type: 'SPORTSDB_SPORT', enabled: true, comingSoon: false,
    label: 'NBA', shortLabel: 'NBA', color: '#F97316',
    badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/frdjqy1536585083.png',
    iconKey: 'SportsBasketball', apiSource: 'thesportsdb', adapterKey: 'NBA',
    numSides: 2, sideLabels: ['Home', 'Away'], sortOrder: 20,
    config: { sportQuery: 'Basketball', leagueFilter: 'NBA' },
  },
  {
    code: 'NHL', type: 'SPORTSDB_SPORT', enabled: true, comingSoon: false,
    label: 'NHL', shortLabel: 'NHL', color: '#3B82F6',
    badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/4cem2k1619616539.png',
    iconKey: 'SportsHockey', apiSource: 'thesportsdb', adapterKey: 'NHL',
    numSides: 2, sideLabels: ['Home', 'Away'], sortOrder: 21,
    config: { sportQuery: 'Ice Hockey', leagueFilter: 'NHL' },
  },
  {
    code: 'NFL', type: 'SPORTSDB_SPORT', enabled: true, comingSoon: false,
    label: 'NFL', shortLabel: 'NFL', color: '#22C55E',
    badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/g85fqz1662057187.png',
    iconKey: 'SportsFootball', apiSource: 'thesportsdb', adapterKey: 'NFL',
    numSides: 2, sideLabels: ['Home', 'Away'], sortOrder: 22,
    config: { sportQuery: 'American Football', leagueFilter: 'NFL' },
  },
  {
    code: 'MMA', type: 'SPORTSDB_SPORT', enabled: true, comingSoon: false,
    label: 'UFC', shortLabel: 'MMA', color: '#EF4444',
    badgeUrl: 'https://r2.thesportsdb.com/images/media/league/badge/bewnz31717531281.png',
    iconKey: 'SportsMma', apiSource: 'thesportsdb', adapterKey: 'MMA',
    numSides: 2, sideLabels: ['Fighter 1', 'Fighter 2'], sortOrder: 23,
    config: { sportQuery: 'Fighting', leagueFilter: 'UFC' },
  },

  // ── TheSportsDB Sports (coming soon) ─────────────────────────────────────
  {
    code: 'MLB', type: 'SPORTSDB_SPORT', enabled: false, comingSoon: true,
    label: 'MLB', shortLabel: 'MLB', color: '#DC2626',
    iconKey: 'SportsBaseball', apiSource: 'thesportsdb', adapterKey: 'MLB',
    numSides: 2, sideLabels: ['Home', 'Away'], sortOrder: 30,
    config: { sportQuery: 'Baseball', leagueFilter: 'MLB' },
  },
  {
    code: 'F1', type: 'SPORTSDB_SPORT', enabled: false, comingSoon: true,
    label: 'Formula 1', shortLabel: 'F1', color: '#E10600',
    iconKey: 'DirectionsCar', apiSource: 'thesportsdb', adapterKey: 'F1',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 31,
    config: { sportQuery: 'Motorsport', leagueFilter: 'Formula 1' },
  },
  {
    code: 'TENNIS', type: 'SPORTSDB_SPORT', enabled: false, comingSoon: true,
    label: 'Tennis', shortLabel: 'Tennis', color: '#84CC16',
    iconKey: 'SportsTennis', apiSource: 'thesportsdb', adapterKey: 'TENNIS',
    numSides: 2, sideLabels: ['Player 1', 'Player 2'], sortOrder: 32,
    config: { sportQuery: 'Tennis', leagueFilter: 'ATP' },
  },
  {
    code: 'RUGBY', type: 'SPORTSDB_SPORT', enabled: false, comingSoon: true,
    label: 'Rugby', shortLabel: 'Rugby', color: '#7C3AED',
    iconKey: 'SportsRugby', apiSource: 'thesportsdb', adapterKey: 'RUGBY',
    numSides: 2, sideLabels: ['Home', 'Away'], sortOrder: 33,
    config: { sportQuery: 'Rugby', leagueFilter: 'Six Nations' },
  },
  {
    code: 'CRICKET', type: 'SPORTSDB_SPORT', enabled: false, comingSoon: true,
    label: 'Cricket', shortLabel: 'Cricket', color: '#059669',
    iconKey: 'SportsCricket', apiSource: 'thesportsdb', adapterKey: 'CRICKET',
    numSides: 2, sideLabels: ['Home', 'Away'], sortOrder: 34,
    config: { sportQuery: 'Cricket', leagueFilter: 'IPL' },
  },
  {
    code: 'ESPORTS', type: 'SPORTSDB_SPORT', enabled: false, comingSoon: true,
    label: 'Esports', shortLabel: 'Esports', color: '#8B5CF6',
    iconKey: 'SportsEsports', apiSource: 'thesportsdb', adapterKey: 'ESPORTS',
    numSides: 2, sideLabels: ['Team 1', 'Team 2'], sortOrder: 35,
    config: { sportQuery: 'ESports', leagueFilter: 'League of Legends' },
  },
  {
    code: 'BOXING', type: 'SPORTSDB_SPORT', enabled: false, comingSoon: true,
    label: 'Boxing', shortLabel: 'Boxing', color: '#B91C1C',
    iconKey: 'SportsMma', apiSource: 'thesportsdb', adapterKey: 'BOXING',
    numSides: 2, sideLabels: ['Fighter 1', 'Fighter 2'], sortOrder: 36,
    config: { sportQuery: 'Fighting', leagueFilter: 'Boxing' },
  },
  {
    code: 'GOLF', type: 'SPORTSDB_SPORT', enabled: false, comingSoon: true,
    label: 'Golf', shortLabel: 'Golf', color: '#16A34A',
    iconKey: 'SportsGolf', apiSource: 'thesportsdb', adapterKey: 'GOLF',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 37,
    config: { sportQuery: 'Golf', leagueFilter: 'PGA Tour' },
  },

  // ── Polymarket Categories (enabled) ──────────────────────────────────────
  {
    code: 'PM_POLITICS', type: 'POLYMARKET', enabled: true, comingSoon: false,
    label: 'Politics', shortLabel: 'Politics', color: '#A78BFA',
    iconKey: 'Gavel', apiSource: 'polymarket', adapterKey: 'POLYMARKET',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 40,
    config: { tags: ['Politics', 'Elections', 'Global Elections'], minVolume24h: 10000, maxDaysAhead: 1100 },
  },
  {
    code: 'PM_GEO', type: 'POLYMARKET', enabled: true, comingSoon: false,
    label: 'Geopolitics', shortLabel: 'Geo', color: '#60A5FA',
    iconKey: 'Public', apiSource: 'polymarket', adapterKey: 'POLYMARKET',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 41,
    config: { tags: ['Geopolitics', 'Middle East'], minVolume24h: 10000, maxDaysAhead: 90 },
  },
  {
    code: 'PM_CULTURE', type: 'POLYMARKET', enabled: true, comingSoon: false,
    label: 'Culture & Entertainment', shortLabel: 'Culture', color: '#F472B6',
    iconKey: 'TheaterComedy', apiSource: 'polymarket', adapterKey: 'POLYMARKET',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 42,
    config: { tags: ['Culture', 'Entertainment', 'Pop Culture'], minVolume24h: 5000, maxDaysAhead: 180 },
  },
  {
    code: 'PM_FINANCE', type: 'POLYMARKET', enabled: true, comingSoon: false,
    label: 'Finance & Economy', shortLabel: 'Finance', color: '#34D399',
    iconKey: 'AccountBalance', apiSource: 'polymarket', adapterKey: 'POLYMARKET',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 43,
    config: { tags: ['Business', 'Commodities', 'Economics', 'Gold', 'Oil', 'Stocks'], minVolume24h: 10000, maxDaysAhead: 60 },
  },

  // ── Polymarket Categories (coming soon) ──────────────────────────────────
  {
    code: 'PM_SCIENCE', type: 'POLYMARKET', enabled: false, comingSoon: true,
    label: 'Science & Tech', shortLabel: 'Sci-Tech', color: '#06B6D4',
    iconKey: 'Science', apiSource: 'polymarket', adapterKey: 'POLYMARKET',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 50,
    config: { tags: ['Science', 'Technology', 'AI', 'Space'], minVolume24h: 5000, maxDaysAhead: 180 },
  },
  {
    code: 'PM_SPORTS', type: 'POLYMARKET', enabled: false, comingSoon: true,
    label: 'Sports Futures', shortLabel: 'Sports PM', color: '#F59E0B',
    iconKey: 'EmojiEvents', apiSource: 'polymarket', adapterKey: 'POLYMARKET',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 51,
    config: { tags: ['Sports'], minVolume24h: 5000, maxDaysAhead: 365 },
  },
  {
    code: 'PM_CLIMATE', type: 'POLYMARKET', enabled: false, comingSoon: true,
    label: 'Climate & Weather', shortLabel: 'Climate', color: '#10B981',
    iconKey: 'Cloud', apiSource: 'polymarket', adapterKey: 'POLYMARKET',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 52,
    config: { tags: ['Climate', 'Weather', 'Environment'], minVolume24h: 5000, maxDaysAhead: 365 },
  },
  {
    code: 'PM_CRYPTO', type: 'POLYMARKET', enabled: false, comingSoon: true,
    label: 'Crypto Markets', shortLabel: 'Crypto PM', color: '#F97316',
    iconKey: 'CurrencyBitcoin', apiSource: 'polymarket', adapterKey: 'POLYMARKET',
    numSides: 2, sideLabels: ['Yes', 'No'], sortOrder: 53,
    config: { tags: ['Crypto', 'Bitcoin', 'Ethereum'], minVolume24h: 10000, maxDaysAhead: 90 },
  },
];

async function main() {
  console.log('Seeding pool categories...');

  for (const cat of CATEGORIES) {
    await prisma.poolCategory.upsert({
      where: { code: cat.code },
      update: {
        type: cat.type,
        enabled: cat.enabled,
        comingSoon: cat.comingSoon,
        label: cat.label,
        shortLabel: cat.shortLabel,
        color: cat.color,
        badgeUrl: cat.badgeUrl,
        iconKey: cat.iconKey,
        apiSource: cat.apiSource,
        adapterKey: cat.adapterKey,
        numSides: cat.numSides,
        sideLabels: cat.sideLabels,
        config: cat.config ?? undefined,
        sortOrder: cat.sortOrder,
      },
      create: {
        code: cat.code,
        type: cat.type,
        enabled: cat.enabled,
        comingSoon: cat.comingSoon,
        label: cat.label,
        shortLabel: cat.shortLabel,
        color: cat.color,
        badgeUrl: cat.badgeUrl,
        iconKey: cat.iconKey,
        apiSource: cat.apiSource,
        adapterKey: cat.adapterKey,
        numSides: cat.numSides,
        sideLabels: cat.sideLabels,
        config: cat.config ?? undefined,
        sortOrder: cat.sortOrder,
      },
    });
  }

  const count = await prisma.poolCategory.count();
  console.log(`Seeded ${count} categories (${CATEGORIES.filter(c => c.enabled).length} enabled, ${CATEGORIES.filter(c => c.comingSoon).length} coming soon)`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
