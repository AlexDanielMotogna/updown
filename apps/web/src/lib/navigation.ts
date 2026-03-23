import { ShowChart, AccountCircle, EmojiEvents, MenuBook, AccountBalanceWallet, PeopleOutline, Groups, MilitaryTech } from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  href: string;
  icon: SvgIconComponent;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Markets', href: '/', icon: ShowChart },
  { label: 'Tournaments', href: '/tournaments', icon: MilitaryTech },
  { label: 'Squads', href: '/squads', icon: Groups },
  { label: 'Profile', href: '/profile', icon: AccountCircle },
  { label: 'Referrals', href: '/referrals', icon: PeopleOutline },
  { label: 'Leaderboard', href: '/leaderboard', icon: EmojiEvents },
  { label: 'Faucet', href: '/faucet', icon: AccountBalanceWallet },
  { label: 'Docs', href: '/docs', icon: MenuBook },
];

// Items shown in desktop header (keep compact to avoid overlap)
export const DESKTOP_NAV_ITEMS = NAV_ITEMS.slice(0, 7);
