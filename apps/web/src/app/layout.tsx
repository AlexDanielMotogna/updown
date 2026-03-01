import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from './providers';

export const dynamic = 'force-dynamic';

const satoshi = localFont({
  src: '../../public/fonts/Satoshi-Variable.woff2',
  variable: '--font-satoshi',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'UpDown',
  description: 'Stake USDC on UP/DOWN price predictions',
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
