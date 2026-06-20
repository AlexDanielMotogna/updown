'use client';

import { type ReactNode, useMemo } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Minimal MUI theme so the few MUI components (wallet dropdown) inherit the
// UpDown look — dark mode + Satoshi, matching the rest of the Tailwind UI.
export function MuiProvider({ children }: { children: ReactNode }) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode: 'dark' },
        typography: { fontFamily: 'Satoshi, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
      }),
    []
  );
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
