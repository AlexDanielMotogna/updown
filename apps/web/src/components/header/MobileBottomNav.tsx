'use client';

import { Box, Button } from '@mui/material';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { NAV_ITEMS } from '@/lib/navigation';

const SHORT_LABELS: Record<string, string> = {
  Tournaments: 'Tourney',
  Leaderboard: 'Ranks',
};

export function MobileBottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Box
      sx={{
        display: { xs: 'flex', lg: 'none' },
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: '#0B0F14',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        px: 0,
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        const mobileLabel = SHORT_LABELS[item.label] ?? item.label;
        return (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
            <Button
              fullWidth
              sx={{
                flexDirection: 'column',
                gap: 0.15,
                color: active ? '#FFFFFF' : 'text.secondary',
                fontWeight: active ? 500 : 400,
                fontSize: { xs: '0.52rem', sm: '0.6rem' },
                py: 0.5,
                px: 0.25,
                minWidth: 0,
                minHeight: 0,
                borderRadius: 0,
                textTransform: 'none',
                lineHeight: 1.2,
                '&:hover': {
                  color: '#FFFFFF',
                  backgroundColor: 'transparent',
                },
              }}
            >
              <Icon sx={{ fontSize: { xs: 16, sm: 18 } }} />
              {mobileLabel}
            </Button>
          </Link>
        );
      })}
    </Box>
  );
}
