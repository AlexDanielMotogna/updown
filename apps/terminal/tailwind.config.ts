import type { Config } from 'tailwindcss';

/**
 * Terminal design system. Pro/dense/dark — intentionally distinct from
 * apps/web's MUI look (ADR-002: "consistency at brand/shell, divergence at the
 * workspace"). Brand tokens will later be lifted to packages/ui-tokens.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { app: '#0b0e11', surface: '#141821', elevated: '#1b212c' },
        border: { DEFAULT: '#232a36', strong: '#2f3847' },
        up: '#16c784',
        down: '#ea3943',
        muted: '#8a94a6',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
