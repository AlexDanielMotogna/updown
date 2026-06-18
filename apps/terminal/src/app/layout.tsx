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
      <body className="flex h-screen flex-col overflow-hidden bg-surface-900 font-sans text-surface-100">
        <Providers>
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-surface-800 px-4">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight">UpDown</span>
              <span className="text-sm text-surface-400">Terminal</span>
            </div>
            <ConnectButton />
          </header>
          <main className="min-h-0 flex-1 p-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
