import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { MuiProvider } from '@/components/MuiProvider';
import { ToastProvider } from '@/components/Toast';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'UpDown Terminal',
  description: 'Pro trading terminal — HyperLiquid',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
