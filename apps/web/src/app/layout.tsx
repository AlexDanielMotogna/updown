import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import { Providers } from './providers';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#060C14',
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
      { url: '/updown-logos/Logo_32px_Cyan_Transparent.png', sizes: '32x32', type: 'image/png' },
      { url: '/updown-logos/Logo_16px_Cyan_Transparent.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/updown-logos/Logo_512px_Cyan_Transparent.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'UpDown',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const initialTheme = cookieStore.get('theme-mode')?.value === 'light' ? 'light' : 'dark';
  const bg = initialTheme === 'light' ? '#F5F7FA' : '#060C14';

  return (
    <html lang="en" className={satoshi.variable} style={{ overflowY: 'scroll', background: bg, colorScheme: initialTheme }} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var m = localStorage.getItem('theme-mode');
              if (m === 'light' || m === 'dark') {
                document.documentElement.style.background = m === 'light' ? '#F5F7FA' : '#060C14';
                document.documentElement.style.colorScheme = m;
              }
            } catch(e) {}
          })();
        `}} />
      </head>
      <body style={{ margin: 0 }}>
        <Providers initialTheme={initialTheme}>{children}</Providers>
      </body>
    </html>
  );
}
