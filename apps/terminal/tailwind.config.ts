import type { Config } from 'tailwindcss';

/**
 * Terminal design system — ported from TradeFightClub (docs/Terminal-Migration
 * 02/03). Bloomberg/TradingView-style neutral grays + warm teal/coral trading
 * colors. The bg/up/down/muted aliases from the early scaffold are kept so
 * existing components don't break while we migrate to the surface/win/loss scale.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef6fc', 100: '#d5e8f7', 200: '#a8cfed', 300: '#7ab4de', 400: '#5196c9',
          500: '#3a7db0', 600: '#2e6593', 700: '#254f75', 800: '#1c3d5a', 900: '#132c42',
        },
        accent: {
          50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1', 400: '#a8a29e',
          500: '#78716c', 600: '#57534e', 700: '#44403c', 800: '#292524', 900: '#1c1917',
        },
        // Dark base aligned to the UpDown app (navy) — bg.app/surface/elevated.
        surface: {
          950: '#04080E', 900: '#060C14', 850: '#0A121C', 800: '#121A26', 700: '#27272a',
          600: '#3f3f46', 500: '#52525b', 400: '#71717a', 300: '#a1a1aa', 200: '#d4d4d8', 100: '#f4f4f5',
        },
        // UpDown brand cyan (logo, connect button, active states).
        brand: { DEFAULT: '#5FD8EF', 400: '#7FE2F5', 500: '#5FD8EF', 600: '#3BBFD9' },
        positive: { DEFAULT: '#26A69A', muted: '#00796B', subtle: 'rgba(38,166,154,0.1)' },
        negative: { DEFAULT: '#EF5350', muted: '#C62828', subtle: 'rgba(239,83,80,0.1)' },
        warning: { DEFAULT: '#FFA726', muted: '#EF6C00', subtle: 'rgba(255,167,38,0.1)' },
        info: { DEFAULT: '#42A5F5', muted: '#1565C0', subtle: 'rgba(66,165,245,0.1)' },
        win: { 400: '#4DB6AC', 500: '#26A69A', 600: '#00897B' },
        loss: { 400: '#E57373', 500: '#EF5350', 600: '#E53935' },
        // --- early-scaffold aliases (kept for compatibility) ---
        bg: { app: '#0c0c0e', surface: '#111113', elevated: '#18181b' },
        border: { DEFAULT: '#27272a', strong: '#3f3f46' },
        up: '#26A69A',
        down: '#EF5350',
        muted: '#71717a',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      },
      // ── Centralized type scale (single source of truth for font sizes) ──
      // Bumped from the cramped early values. Adjust ONLY here to retune the
      // whole terminal's typography. [size, lineHeight].
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], //  11px — micro labels
        xs: ['0.8125rem', { lineHeight: '1.1rem' }], //   13px — labels / dense tables
        sm: ['0.875rem', { lineHeight: '1.25rem' }], //   14px — body / values (default)
        base: ['0.9375rem', { lineHeight: '1.4rem' }], // 15px — emphasized body
        md: ['1.0625rem', { lineHeight: '1.5rem' }], //   17px — sub-headings
        lg: ['1.1875rem', { lineHeight: '1.6rem' }], //   19px — headings
        xl: ['1.375rem', { lineHeight: '1.75rem' }], //   22px — large numbers
        '2xl': ['1.75rem', { lineHeight: '2.1rem' }], //  28px
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0,0,0,0.3)',
        card: '0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.4)',
        elevated: '0 4px 6px -1px rgba(0,0,0,0.4), 0 2px 4px -2px rgba(0,0,0,0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'sheet-up': 'sheetUp 0.45s cubic-bezier(0.32,0.72,0,1)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(4px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        sheetUp: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};

export default config;
