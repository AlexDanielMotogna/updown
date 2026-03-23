'use client';

import { useState } from 'react';
import { Box, Button, Drawer, Typography } from '@mui/material';
import { MoreHoriz } from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { NAV_ITEMS } from '@/lib/navigation';

const PRIMARY_COUNT = 4;

export function MobileBottomNav() {
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
          backgroundColor: '#0B0F14',
          borderTop: '1px solid rgba(255,255,255,0.06)',
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
                  color: active ? '#FFFFFF' : 'text.secondary',
                  fontWeight: active ? 500 : 400,
                  fontSize: '0.6rem',
                  py: 0.75,
                  px: 0.5,
                  minWidth: 0,
                  minHeight: 0,
                  borderRadius: 0,
                  textTransform: 'none',
                  lineHeight: 1.2,
                  '&:hover': { color: '#FFFFFF', backgroundColor: 'transparent' },
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
            color: moreOpen ? '#FFFFFF' : 'text.secondary',
            fontWeight: 400,
            fontSize: '0.6rem',
            py: 0.75,
            px: 0.5,
            minHeight: 0,
            borderRadius: 0,
            textTransform: 'none',
            lineHeight: 1.2,
            '&:hover': { color: '#FFFFFF', backgroundColor: 'transparent' },
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
            bgcolor: '#0B0F14',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            pb: 'env(safe-area-inset-bottom)',
          },
          '& .MuiBackdrop-root': { bgcolor: 'rgba(0,0,0,0.5)' },
        }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
          <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.15)', mx: 'auto', mb: 2 }} />
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
                    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
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
