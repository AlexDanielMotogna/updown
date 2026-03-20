import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Providers } from './providers';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#0B0F14',
};

const satoshi = localFont({
  src: '../../public/fonts/Satoshi-Variable.woff2',
  variable: '--font-satoshi',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'UpDown',
  description: 'Stake USDC on UP/DOWN price predictions',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/updown-logos/Logo_32px.png', sizes: '32x32', type: 'image/png' },
      { url: '/updown-logos/Logo_16px.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/updown-logos/Logo_180px.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'UpDown',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={satoshi.variable} style={{ overflowY: 'scroll', background: '#0B0F14' }}>
      <body style={{ margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
