'use client';

import { ReactNode } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0B0F14', paper: '#111820' },
    text: { primary: '#FFFFFF', secondary: 'rgba(255,255,255,0.5)' },
    divider: 'rgba(255,255,255,0.08)',
    success: { main: '#22C55E' },
    warning: { main: '#F59E0B' },
    error: { main: '#F87171' },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  shape: { borderRadius: 4 },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none' } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 4 } } },
  },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
