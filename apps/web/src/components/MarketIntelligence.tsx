'use client';

import { Box, Typography, Grid } from '@mui/material';
import type { PacificaPriceData } from '@/hooks/usePacificaPrices';
import { useThemeTokens } from '@/app/providers';

interface MarketIntelligenceProps {
  asset: string;
  priceData: PacificaPriceData | null;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatRate(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(4)}%`;
}

function formatSpread(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(4)}%`;
}

interface CardData {
  label: string;
  value: string;
  color: string;
  subtext?: string;
  subtextHighlight?: string;
  subtextHighlightColor?: string;
}

export function MarketIntelligence({ asset, priceData }: MarketIntelligenceProps) {
  const t = useThemeTokens();
  if (!priceData) {
    return (
      <Box sx={{ mb: 4 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', mb: 2, display: 'block' }}>
          MARKET INTELLIGENCE  {asset}
        </Typography>
        <Grid container spacing={1.5} alignItems="stretch">
          {['Funding Rate', 'Open Interest', '24h Volume', 'Mark/Oracle Spread'].map((label) => (
            <Grid item xs={6} key={label} sx={{ display: 'flex' }}>
              <Box
                sx={{
                  p: { xs: 1.5, sm: 2 },
                  borderRadius: 0,
                  background: t.hover.default,
                  border: 'none',
                  flex: 1,
                }}
              >
                <Typography sx={{ fontSize: '0.6rem', color: t.text.tertiary, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'none' }}>
                  {label}
                </Typography>
                <Typography sx={{ fontSize: { xs: '0.85rem', sm: '1.1rem' }, fontWeight: 300, color: t.text.muted, mt: 0.5 }}>
                  ---
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  const fundingColor = priceData.nextFunding >= 0 ? t.up : t.down;
  const spreadDivergent = Math.abs(priceData.spreadPct) > 0.05;
  const spreadColor = spreadDivergent ? t.down : t.text.bright;

  const change24h = priceData.priceChange24hPct;
  const change24hSign = change24h >= 0 ? '+' : '';

  const cards: CardData[] = [
    {
      label: 'Funding Rate',
      value: formatRate(priceData.nextFunding),
      color: fundingColor,
      subtext: priceData.nextFunding >= 0 ? 'Longs pay shorts /hr' : 'Shorts pay longs /hr',
    },
    {
      label: 'Open Interest',
      value: formatCompact(priceData.openInterest * priceData.mark),
      color: t.text.vivid,
      subtext: 'Total open positions',
    },
    {
      label: '24h Volume',
      value: formatCompact(priceData.volume24h * priceData.mark),
      color: t.text.vivid,
      subtext: '24h change',
      subtextHighlight: `${change24hSign}${change24h.toFixed(2)}%`,
      subtextHighlightColor: change24h >= 0 ? t.up : t.down,
    },
    {
      label: 'Mark/Oracle Spread',
      value: formatSpread(priceData.spreadPct),
      color: spreadColor,
      subtext: spreadDivergent ? 'Divergent' : 'Normal',
    },
  ];

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 2, display: 'block' }}>
        MARKET INTELLIGENCE  {asset}
      </Typography>
      <Grid container spacing={1.5} alignItems="stretch">
        {cards.map((card) => (
          <Grid item xs={6} key={card.label} sx={{ display: 'flex' }}>
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderRadius: 0,
                background: t.hover.default,
                border: 'none',
                flex: 1,
              }}
            >
              <Typography sx={{ fontSize: '0.6rem', color: t.text.tertiary, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'none' }}>
                {card.label}
              </Typography>
              <Typography sx={{ fontSize: { xs: '0.85rem', sm: '1rem' }, fontWeight: 300, color: card.color, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                {card.value}
              </Typography>
              {card.subtext && (
                <Typography sx={{ fontSize: '0.6rem', color: t.text.dimmed, mt: 0.25 }}>
                  {card.subtextHighlight && (
                    <Box component="span" sx={{ color: card.subtextHighlightColor, fontWeight: 500 }}>
                      {card.subtextHighlight}
                    </Box>
                  )}
                  {card.subtextHighlight ? ' ' : ''}{card.subtext}
                </Typography>
              )}
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
