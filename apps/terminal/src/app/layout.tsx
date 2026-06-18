import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ConnectButton } from '@/components/ConnectButton';

export const metadata: Metadata = {
  title: 'UpDown Terminal',
  description: 'Pro trading terminal — HyperLiquid',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg-app text-[#e6e9ef] font-mono">
        <Providers>
          <header className="flex items-center justify-between border-b border-border px-4 h-12">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight">UpDown</span>
              <span className="text-muted text-sm">Terminal</span>
            </div>
            <ConnectButton />
          </header>
          <main className="p-4">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
