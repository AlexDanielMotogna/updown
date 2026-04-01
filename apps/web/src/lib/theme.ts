// ---------------------------------------------------------------------------
// Centralized theme — single source of truth for all colors
// ---------------------------------------------------------------------------

// ─── Hex alpha helper ─────────────────────────────────────────────────────────
/** Convert hex + opacity (0–1) to hex-alpha string, e.g. withAlpha('#FF0000', 0.5) → '#FF000080' */
export function withAlpha(hex: string, opacity: number): string {
  const clamped = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  return `${hex}${clamped.toString(16).padStart(2, '0').toUpperCase()}`;
}

// ─── Color Primitives (raw values, no semantics) ─────────────────────────────
export const palette = {
  // Brand
  cyan: '#5FD8EF',
  // Greens
  green400: '#4ADE80',
  green500: '#22C55E',
  green600: '#16A34A',
  // Reds
  red400: '#F87171',
  red500: '#EF4444',
  red600: '#DC2626',
  // Ambers
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  amber600: '#D97706',
  // Blues
  blue400: '#60A5FA',
  blue500: '#3B82F6',
  // Indigos
  indigo400: '#818CF8',
  indigo500: '#6366F1',
  // Violets
  violet300: '#A78BFA',
  violet500: '#8B5CF6',
  // Others
  orange500: '#F97316',
  orange400: '#FB923C',
  pink400: '#F472B6',
  fuchsia400: '#E879F9',
  rose500: '#F43F5E',
  purple500: '#A855F7',
  yellow400: '#FACC15',
  cyan500: '#06B6D4',
  teal400: '#34D399',
  teal500: '#10B981',
  lightBlue300: '#93C5FD',
  purple400: '#C084FC',
  gray500: '#6B7280',
  grayFallback: '#E5E7EB',

  // Medals
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  nearBlack: '#0A0A0A',
} as const;

// ─── Theme Token Shape ────────────────────────────────────────────────────────
export interface ThemeTokens {
  mode: 'dark' | 'light';

  // Backgrounds
  bg: {
    app: string;
    surface: string;
    surfaceAlt: string;
    elevated: string;
    tooltip: string;
    chart: string;
    dialog: string;
    input: string;
  };

  // Text
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    quaternary: string;
    dimmed: string;
    muted: string;
    disabled: string;
    rich: string;
    bright: string;
    vivid: string;
    strong: string;
    soft: string;
    contrast: string;   // for dark text on colored buttons
  };

  // Borders
  border: {
    subtle: string;
    default: string;
    medium: string;
    strong: string;
    emphasis: string;
    hover: string;
    active: string;
  };

  // Surface styling (border + shadow for cards/boxes in light mode)
  surfaceBorder: string;
  surfaceShadow: string;

  // Hover / interactive backgrounds
  hover: {
    subtle: string;
    light: string;
    default: string;
    medium: string;
    strong: string;
    emphasis: string;
  };

  // Shadows
  shadow: {
    light: string;
    default: string;
    deep: string;
  };

  // Scrollbar
  scrollbar: {
    thumb: string;
    track: string;
  };

  // ─── Semantic colors ─────────────────────────────
  up: string;
  down: string;
  draw: string;
  gain: string;
  accent: string;

  // Status
  success: string;
  successDark: string;
  warning: string;
  error: string;
  info: string;

  // ─── Feature colors ──────────────────────────────
  predict: string;       // tournament predictions (#818CF8)
  prediction: string;    // polymarket/prediction markets (#A78BFA)
  link: string;          // clickable links
  gold: string;
  silver: string;
  bronze: string;

  // ─── Level tier colors ───────────────────────────
  levelTiers: string[];

  // ─── Category colors (docs / polymarket) ─────────
  categoryColors: {
    politics: string;
    geopolitics: string;
    culture: string;
    finance: string;
    scienceTech: string;
    sportsFutures: string;
    climate: string;
    cryptoMarkets: string;
  };

  // ─── Token allocation colors ─────────────────────
  allocationColors: {
    playToEarn: string;
    liquidity: string;
    team: string;
    treasury: string;
    community: string;
    marketing: string;
    advisors: string;
  };

  // ─── Admin type/status maps ──────────────────────
  adminTypeColors: {
    footballLeague: string;
    sportsdbSport: string;
    polymarket: string;
  };

  // ─── Log severity colors (admin) ─────────────────
  logColors: {
    info: string;
    success: string;
    warn: string;
    error: string;
    poolStart: string;
    complete: string;
  };
}

// ─── Dark Tokens ──────────────────────────────────────────────────────────────
export const darkTokens: ThemeTokens = {
  mode: 'dark',

  bg: {
    app: '#060C14',
    surface: '#0A121C',
    surfaceAlt: '#081019',
    elevated: '#121A26',
    tooltip: '#121A26',
    chart: '#0A121C',
    dialog: '#081019',
    input: 'rgba(255,255,255,0.02)',
  },

  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255,255,255,0.5)',
    tertiary: 'rgba(255,255,255,0.4)',
    quaternary: 'rgba(255,255,255,0.35)',
    dimmed: 'rgba(255,255,255,0.3)',
    muted: 'rgba(255,255,255,0.25)',
    disabled: 'rgba(255,255,255,0.38)',
    rich: 'rgba(255,255,255,0.65)',
    bright: 'rgba(255,255,255,0.7)',
    vivid: 'rgba(255,255,255,0.85)',
    strong: 'rgba(255,255,255,0.55)',
    soft: 'rgba(255,255,255,0.45)',
    contrast: '#000000',
  },

  surfaceBorder: 'none',
  surfaceShadow: 'none',

  border: {
    subtle: 'rgba(255,255,255,0.04)',
    default: 'rgba(255,255,255,0.06)',
    medium: 'rgba(255,255,255,0.08)',
    strong: 'rgba(255,255,255,0.1)',
    emphasis: 'rgba(255,255,255,0.12)',
    hover: 'rgba(255,255,255,0.2)',
    active: 'rgba(255,255,255,0.3)',
  },

  hover: {
    subtle: 'rgba(255,255,255,0.02)',
    light: 'rgba(255,255,255,0.03)',
    default: 'rgba(255,255,255,0.04)',
    medium: 'rgba(255,255,255,0.06)',
    strong: 'rgba(255,255,255,0.08)',
    emphasis: 'rgba(255,255,255,0.1)',
  },

  shadow: {
    light: 'rgba(0,0,0,0.4)',
    default: 'rgba(0,0,0,0.5)',
    deep: 'rgba(0,0,0,0.6)',
  },

  scrollbar: {
    thumb: 'rgba(255,255,255,0.1)',
    track: '#060C14',
  },

  // Semantic
  up: palette.cyan,
  down: palette.red400,
  draw: palette.amber400,
  gain: palette.green500,
  accent: palette.amber500,

  // Status
  success: palette.green500,
  successDark: palette.green600,
  warning: palette.amber500,
  error: palette.red400,
  info: palette.blue400,

  // Feature
  predict: palette.indigo400,
  prediction: palette.violet300,
  link: palette.blue500,
  gold: palette.gold,
  silver: palette.silver,
  bronze: palette.bronze,

  // Level tiers (index 0 = level 1-4, index 9 = level 37-40)
  levelTiers: [
    'rgba(255,255,255,0.5)',   // 1-4: Rookie
    palette.green400,           // 5-8: Rising
    palette.green500,           // 9-12: Skilled
    palette.amber500,           // 13-16: Pro
    palette.violet300,          // 17-20: Veteran
    palette.pink400,            // 21-24: Elite
    palette.orange400,          // 25-28: Expert
    palette.rose500,            // 29-32: Legend
    palette.fuchsia400,         // 33-36: Titan
    palette.yellow400,          // 37-40: Apex
  ],

  // Category colors
  categoryColors: {
    politics: palette.violet300,
    geopolitics: palette.blue400,
    culture: palette.pink400,
    finance: palette.teal400,
    scienceTech: palette.cyan500,
    sportsFutures: palette.amber500,
    climate: palette.teal500,
    cryptoMarkets: palette.orange500,
  },

  // Allocation colors
  allocationColors: {
    playToEarn: palette.green500,
    liquidity: palette.green400,
    team: palette.amber500,
    treasury: palette.violet300,
    community: palette.pink400,
    marketing: palette.orange400,
    advisors: palette.fuchsia400,
  },

  // Admin type colors
  adminTypeColors: {
    footballLeague: palette.green500,
    sportsdbSport: palette.orange500,
    polymarket: palette.violet300,
  },

  // Admin log colors
  logColors: {
    info: palette.lightBlue300,
    success: palette.green400,
    warn: palette.amber400,
    error: palette.red400,
    poolStart: palette.purple400,
    complete: palette.green500,
  },
};

// ─── Light Tokens ─────────────────────────────────────────────────────────────
export const lightTokens: ThemeTokens = {
  mode: 'light',

  bg: {
    app: '#F5F7FA',              // off-white, not harsh
    surface: '#FFFFFF',           // cards/tables: clean white
    surfaceAlt: '#F0F2F5',       // rows/sections: slightly tinted
    elevated: '#FFFFFF',
    tooltip: '#1E293B',          // tooltips stay dark
    chart: '#FFFFFF',
    dialog: '#FFFFFF',
    input: 'rgba(15,23,42,0.03)',
  },

  text: {
    primary: '#0A0F1A',
    secondary: '#334155',
    tertiary: '#475569',
    quaternary: '#556677',
    dimmed: '#64748B',
    muted: '#78859B',
    disabled: '#94A3B8',
    rich: '#1E293B',
    bright: '#0F172A',
    vivid: '#0A0F1A',
    strong: '#2D3B4E',
    soft: '#3E4C5F',
    contrast: '#0A0F1A',
  },

  surfaceBorder: '1px solid rgba(15,23,42,0.18)',
  surfaceShadow: '0 2px 10px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',

  border: {
    subtle: 'rgba(15,23,42,0.06)',
    default: 'rgba(15,23,42,0.10)',
    medium: 'rgba(15,23,42,0.12)',
    strong: 'rgba(15,23,42,0.15)',
    emphasis: 'rgba(15,23,42,0.18)',
    hover: 'rgba(15,23,42,0.22)',
    active: 'rgba(15,23,42,0.30)',
  },

  hover: {
    subtle: 'rgba(15,23,42,0.02)',
    light: 'rgba(15,23,42,0.03)',
    default: 'rgba(15,23,42,0.04)',
    medium: 'rgba(15,23,42,0.06)',
    strong: 'rgba(15,23,42,0.08)',
    emphasis: 'rgba(15,23,42,0.10)',
  },

  shadow: {
    light: 'rgba(0,0,0,0.04)',
    default: 'rgba(0,0,0,0.08)',
    deep: 'rgba(0,0,0,0.15)',
  },

  scrollbar: {
    thumb: 'rgba(15,23,42,0.12)',
    track: '#F0F2F5',
  },

  // Semantic — cyan for buttons, darker variants for light bg
  up: palette.cyan,
  down: palette.red500,
  draw: palette.amber600,
  gain: palette.green600,
  accent: palette.amber600,

  // Status
  success: palette.green600,
  successDark: palette.green600,
  warning: palette.amber600,
  error: palette.red500,
  info: palette.blue500,

  // Feature
  predict: palette.indigo500,
  prediction: palette.violet500,
  link: palette.blue500,
  gold: palette.gold,
  silver: '#A0AEC0',
  bronze: palette.bronze,

  // Same tier colors work on light bg
  levelTiers: [
    'rgba(15,23,42,0.4)',
    palette.green500,
    palette.green600,
    palette.amber600,
    palette.violet500,
    palette.pink400,
    palette.orange500,
    palette.rose500,
    palette.fuchsia400,
    palette.yellow400,
  ],

  categoryColors: {
    politics: palette.violet500,
    geopolitics: palette.blue500,
    culture: palette.pink400,
    finance: palette.teal500,
    scienceTech: palette.cyan500,
    sportsFutures: palette.amber600,
    climate: palette.teal500,
    cryptoMarkets: palette.orange500,
  },

  allocationColors: {
    playToEarn: palette.green600,
    liquidity: palette.green500,
    team: palette.amber600,
    treasury: palette.violet500,
    community: palette.pink400,
    marketing: palette.orange500,
    advisors: palette.fuchsia400,
  },

  adminTypeColors: {
    footballLeague: palette.green600,
    sportsdbSport: palette.orange500,
    polymarket: palette.violet500,
  },

  logColors: {
    info: palette.blue500,
    success: palette.green500,
    warn: palette.amber500,
    error: palette.red500,
    poolStart: palette.purple500,
    complete: palette.green600,
  },
};

// ─── Backward-compat re-exports (remove after full migration) ─────────────────
export const UP_COLOR = palette.cyan;
export const DOWN_COLOR = palette.red400;
export const DRAW_COLOR = palette.amber400;
export const GAIN_COLOR = palette.green500;
export const ACCENT_COLOR = palette.amber500;
