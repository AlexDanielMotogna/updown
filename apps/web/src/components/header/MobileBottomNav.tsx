'use client';

import { useState } from 'react';
import { Box, Button, Drawer, Typography } from '@mui/material';
import { MoreHoriz } from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { NAV_ITEMS } from '@/lib/navigation';
import { useThemeTokens } from '@/app/providers';

const PRIMARY_COUNT = 4;

export function MobileBottomNav() {
  const t = useThemeTokens();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const primary = NAV_ITEMS.slice(0, PRIMARY_COUNT);
  const secondary = NAV_ITEMS.slice(PRIMARY_COUNT);

  return (
    <>
      <Box
        sx={{
          display: { xs: 'flex', lg: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: t.bg.app,
          borderTop: `1px solid ${t.border.default}`,
          px: 0,
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        {primary.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
              <Button
                fullWidth
                sx={{
                  flexDirection: 'column',
                  gap: 0.15,
                  color: active ? t.text.primary : 'text.secondary',
                  fontWeight: active ? 500 : 400,
                  fontSize: '0.6rem',
                  py: 0.75,
                  px: 0.5,
                  minWidth: 0,
                  minHeight: 0,
                  borderRadius: 0,
                  textTransform: 'none',
                  lineHeight: 1.2,
                  '&:hover': { color: t.text.primary, backgroundColor: 'transparent' },
                }}
              >
                <Icon sx={{ fontSize: 20 }} />
                {item.label}
              </Button>
            </Link>
          );
        })}

        {/* More button */}
        <Button
          onClick={() => setMoreOpen(true)}
          sx={{
            flex: 1,
            minWidth: 0,
            flexDirection: 'column',
            gap: 0.15,
            color: moreOpen ? t.text.primary : 'text.secondary',
            fontWeight: 400,
            fontSize: '0.6rem',
            py: 0.75,
            px: 0.5,
            minHeight: 0,
            borderRadius: 0,
            textTransform: 'none',
            lineHeight: 1.2,
            '&:hover': { color: t.text.primary, backgroundColor: 'transparent' },
          }}
        >
          <MoreHoriz sx={{ fontSize: 20 }} />
          More
        </Button>
      </Box>

      {/* More drawer */}
      <Drawer
        anchor="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': {
            bgcolor: t.bg.app,
            backgroundImage: 'none',
            borderTop: `1px solid ${t.border.medium}`,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            pb: 'env(safe-area-inset-bottom)',
          },
          '& .MuiBackdrop-root': { bgcolor: t.shadow.default },
        }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: t.border.emphasis, mx: 'auto', mb: 2 }} />
          {secondary.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }} onClick={() => setMoreOpen(false)}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1.5,
                    color: active ? t.text.primary : t.text.secondary,
                    '&:hover': { bgcolor: t.hover.default },
                    transition: 'background 0.15s ease',
                  }}
                >
                  <Icon sx={{ fontSize: 20 }} />
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: active ? 600 : 400 }}>
                    {item.label}
                  </Typography>
                </Box>
              </Link>
            );
          })}
        </Box>
      </Drawer>
    </>
  );
}
