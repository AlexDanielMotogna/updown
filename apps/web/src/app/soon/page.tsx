import type { Metadata } from 'next';

/**
 * Deployment notice. This is what the production host serves while the app is
 * being moved to a development environment — see middleware.ts, which redirects
 * every route here except /admin and /api.
 *
 * Deliberately dumb: a server component with inline styles, no providers, no
 * Privy, no data fetching. The page has to render even when everything behind it
 * is down, which is exactly when it is needed.
 */
export const metadata: Metadata = {
  title: 'UpDown — Moving to development',
  description: 'UpDown is being redeployed to a development environment.',
};

const CYAN = '#5FD8EF';

export default function SoonPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: '32px 20px',
        background: '#060C14',
        color: '#E8EEF5',
        textAlign: 'center',
        fontFamily: 'var(--font-satoshi), system-ui, sans-serif',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/updown-logos/Logo_cyan_text_white.png" alt="UpDown" style={{ height: 34, width: 'auto' }} />

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 800, letterSpacing: '-0.02em' }}>
          We are moving to a development environment
        </h1>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, color: '#9FB0C0' }}>
          UpDown will be redeployed within the next <strong style={{ color: CYAN }}>24 hours</strong>. The app is
          offline while we migrate.
        </p>
        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6, color: '#9FB0C0' }}>
          The Crypto Predictions event has ended. Thanks to everyone who played. Weekly prizes are settled from the
          final leaderboard and paid out manually.
        </p>
      </div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderRadius: 999,
          border: '1px solid rgba(95, 216, 239, 0.28)',
          background: 'rgba(95, 216, 239, 0.08)',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: CYAN,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: CYAN, display: 'inline-block' }} />
        Deployment in progress
      </div>

      <p style={{ margin: 0, fontSize: '0.75rem', color: '#5C6B7A' }}>updown.my</p>
    </main>
  );
}
