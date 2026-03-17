import { ShowChart, WorkOutline, EmojiEvents } from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  href: string;
  icon: SvgIconComponent;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Markets', href: '/', icon: ShowChart },
  { label: 'Profile', href: '/profile', icon: WorkOutline },
  { label: 'Leaderboard', href: '/leaderboard', icon: EmojiEvents },
];
