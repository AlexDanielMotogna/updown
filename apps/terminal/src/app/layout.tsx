import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { MuiProvider } from '@/components/MuiProvider';
import { ToastProvider } from '@/components/Toast';
import { Navbar } from '@/components/Navbar';

// Same UI font as the app (apps/web) — loaded via next/font and exposed under the
// --font-satoshi variable that tailwind's font-sans resolves to, so the terminal
// renders in Inter instead of falling back to a system font.
const inter = Inter({ subsets: ['latin'], variable: '--font-satoshi', display: 'swap' });

export const metadata: Metadata = {
  title: 'UpDown Terminal',
  description: 'Pro trading terminal — HyperLiquid',
  icons: {
    icon: [
      { url: '/updown-logos/Logo_32px_Cyan_Transparent.png', sizes: '32x32', type: 'image/png' },
      { url: '/updown-logos/Logo_16px_Cyan_Transparent.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/updown-logos/Logo_512px_Cyan_Transparent.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex h-screen flex-col overflow-hidden bg-surface-900 font-sans text-surface-100">
        <Providers>
          <MuiProvider>
            <ToastProvider>
              <Navbar />
              <main className="min-h-0 flex-1 p-1">{children}</main>
            </ToastProvider>
          </MuiProvider>
        </Providers>
      </body>
    </html>
  );
}
