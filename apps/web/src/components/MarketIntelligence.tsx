'use client';

import { Box, Typography, Grid } from '@mui/material';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';
import type { PacificaPriceData } from '@/hooks/usePacificaPrices';

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
  if (!priceData) {
    return (
      <Box sx={{ mb: 4 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', mb: 2, display: 'block' }}>
          MARKET INTELLIGENCE — {asset}
        </Typography>
        <Grid container spacing={1.5} alignItems="stretch">
          {['Funding Rate', 'Open Interest', '24h Volume', 'Mark/Oracle Spread'].map((label) => (
            <Grid item xs={6} key={label} sx={{ display: 'flex' }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  flex: 1,
                }}
              >
                <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {label}
                </Typography>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 300, color: 'rgba(255,255,255,0.2)', mt: 0.5 }}>
                  ---
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  const fundingColor = priceData.nextFunding >= 0 ? UP_COLOR : DOWN_COLOR;
  const spreadDivergent = Math.abs(priceData.spreadPct) > 0.05;
  const spreadColor = spreadDivergent ? DOWN_COLOR : 'rgba(255,255,255,0.7)';

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
      color: 'rgba(255,255,255,0.85)',
      subtext: 'Total open positions',
    },
    {
      label: '24h Volume',
      value: formatCompact(priceData.volume24h * priceData.mark),
      color: 'rgba(255,255,255,0.85)',
      subtext: '24h change',
      subtextHighlight: `${change24hSign}${change24h.toFixed(2)}%`,
      subtextHighlightColor: change24h >= 0 ? UP_COLOR : DOWN_COLOR,
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
        MARKET INTELLIGENCE — {asset}
      </Typography>
      <Grid container spacing={1.5} alignItems="stretch">
        {cards.map((card) => (
          <Grid item xs={6} key={card.label} sx={{ display: 'flex' }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 1,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                flex: 1,
              }}
            >
              <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {card.label}
              </Typography>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 300, color: card.color, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                {card.value}
              </Typography>
              {card.subtext && (
                <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', mt: 0.25 }}>
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
