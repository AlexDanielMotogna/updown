import { ShowChart, WorkOutline, EmojiEvents, MenuBook, AccountBalanceWallet, PeopleOutline, Groups } from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  href: string;
  icon: SvgIconComponent;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Markets', href: '/', icon: ShowChart },
  { label: 'Squads', href: '/squads', icon: Groups },
  { label: 'Profile', href: '/profile', icon: WorkOutline },
  { label: 'Referrals', href: '/referrals', icon: PeopleOutline },
  { label: 'Leaderboard', href: '/leaderboard', icon: EmojiEvents },
  { label: 'Faucet', href: '/faucet', icon: AccountBalanceWallet },
  { label: 'Docs', href: '/docs', icon: MenuBook },
];
