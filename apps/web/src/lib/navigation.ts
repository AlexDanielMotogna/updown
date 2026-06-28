import { ShowChart, CandlestickChart, AccountCircle, EmojiEvents, MenuBook, AccountBalanceWallet, PeopleOutline } from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  href: string;
  icon: SvgIconComponent;
  /** External app (e.g. the trading terminal) — full navigation, never "active". */
  external?: boolean;
}

// Trading terminal lives on its own subdomain/app (NEXT_PUBLIC_TERMINAL_URL).
const rawTerminalUrl = (process.env.NEXT_PUBLIC_TERMINAL_URL ?? 'http://localhost:3010').replace(/\/$/, '');
const TERMINAL_URL = /^https?:\/\//.test(rawTerminalUrl) ? rawTerminalUrl : `https://${rawTerminalUrl}`;

export const NAV_ITEMS: NavItem[] = [
  { label: 'Markets', href: '/', icon: ShowChart },
  // Link straight to a trade page (not the terminal root): the terminal has no
  // server redirect on `/`, so a bare TERMINAL_URL can't reliably land Pro users
  // on the trade view. /trade/BTC/USDC works in both Simple and Pro.
  { label: 'Trade', href: `${TERMINAL_URL}/trade/BTC/USDC`, icon: CandlestickChart, external: true },
  // Tournaments + Squads temporarily disabled (under construction) — also
  // redirected to / in next.config.js. Re-add here to re-enable.
  // { label: 'Tournaments', href: '/tournaments', icon: MilitaryTech },
  // { label: 'Squads', href: '/squads', icon: Groups },
  { label: 'Profile', href: '/profile', icon: AccountCircle },
  { label: 'Referrals', href: '/referrals', icon: PeopleOutline },
  { label: 'Leaderboard', href: '/leaderboard', icon: EmojiEvents },
  { label: 'Faucet', href: '/faucet', icon: AccountBalanceWallet },
  { label: 'Docs', href: '/docs', icon: MenuBook },
];

// Items shown in desktop header (keep compact to avoid overlap)
export const DESKTOP_NAV_ITEMS = NAV_ITEMS.slice(0, 7);
