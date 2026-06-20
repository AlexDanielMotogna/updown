import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ToastProvider } from '@/components/Toast';
import { ConnectButton } from '@/components/ConnectButton';
import { HeaderBalance } from '@/components/HeaderBalance';

export const metadata: Metadata = {
  title: 'UpDown Terminal',
  description: 'Pro trading terminal — HyperLiquid',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen flex-col overflow-hidden bg-surface-900 font-sans text-surface-100">
        <Providers>
          <ToastProvider>
          <header className="flex h-12 shrink-0 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight">UpDown</span>
              <span className="text-sm text-surface-400">Terminal</span>
            </div>
            <div className="flex items-center gap-2">
              <HeaderBalance />
              <ConnectButton />
            </div>
          </header>
          <main className="min-h-0 flex-1 p-1">{children}</main>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
