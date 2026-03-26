import {
  Gavel, Public, TheaterComedy, AccountBalance,
  SportsBasketball, SportsFootball, SportsMma, SportsHockey, SportsSoccer,
  SportsBaseball, SportsTennis, SportsRugby, SportsCricket, SportsEsports, SportsGolf,
  ShowChart, TrendingUp, GridView, EmojiEvents,
  DirectionsCar, Science, Cloud, CurrencyBitcoin,
} from '@mui/icons-material';
import type { SvgIconProps } from '@mui/material';
import type { ComponentType } from 'react';

export const ICON_REGISTRY: Record<string, ComponentType<SvgIconProps>> = {
  Gavel, Public, TheaterComedy, AccountBalance,
  SportsBasketball, SportsFootball, SportsMma, SportsHockey, SportsSoccer,
  SportsBaseball, SportsTennis, SportsRugby, SportsCricket, SportsEsports, SportsGolf,
  ShowChart, TrendingUp, GridView, EmojiEvents,
  DirectionsCar, Science, Cloud, CurrencyBitcoin,
};

export function getIcon(key: string | null | undefined): ComponentType<SvgIconProps> | null {
  if (!key) return null;
  return ICON_REGISTRY[key] || null;
}
