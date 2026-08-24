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

/**
 * The official channels, the only way back in while the app is down. Same links,
 * same icons and same order as the app footer (components/AppShell.tsx) — this
 * page can't import it (it pulls MUI and the theme), so the paths are duplicated
 * verbatim rather than redrawn.
 */
const SOCIALS = [
  {
    label: 'X',
    href: 'https://x.com/Official_UpDown',
    size: 18,
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    label: 'Discord',
    href: 'https://discord.gg/C8ug6NBvx8',
    size: 20,
    path: 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z',
  },
  {
    label: 'Telegram',
    href: 'https://t.me/updown_official',
    size: 20,
    path: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  },
];

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

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '0.78rem', color: '#5C6B7A' }}>Follow the relaunch</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              className="soon-link"
              style={{ display: 'flex', color: 'rgba(255,255,255,0.3)' }}
            >
              <svg width={s.size} height={s.size} viewBox="0 0 24 24" fill="currentColor"><path d={s.path} /></svg>
            </a>
          ))}
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '0.75rem', color: '#5C6B7A' }}>updown.my</p>

      {/* Inline styles cannot express :hover, and one rule is not worth pulling a
          styling runtime into a page whose whole point is having no dependencies.
          Same dimmed → bright transition the footer uses. */}
      <style>{`
        .soon-link { transition: color 0.15s; }
        .soon-link:hover { color: rgba(255,255,255,0.7); }
      `}</style>
    </main>
  );
}
