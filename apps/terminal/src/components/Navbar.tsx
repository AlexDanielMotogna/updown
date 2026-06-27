'use client';

import { Fragment } from 'react';
import { ConnectButton } from './ConnectButton';
import { HeaderBalance } from './HeaderBalance';
import { ProfileStats } from './ProfileStats';
import { NotificationBell } from './NotificationBell';
import { TradeModeMenu } from './TradeModeMenu';
import { FundButton } from './FundButton';

// The main UpDown app (Markets/Profile/Leaderboard live there). The terminal is
// the "Trade" mode of the same product (ADR-002), so the nav links cross back to
// the app while Trade stays here.
const rawAppUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
// Prepend https:// if the env var omits the protocol (else it's treated relative).
const APP_URL = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`;

// Trade is rendered as a dropdown (Simple|Pro) between Markets and Profile — see
// the nav below. These are the plain cross-links to the main app.
const LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: 'Markets', href: `${APP_URL}/`, external: true },
  { label: 'Profile', href: `${APP_URL}/profile`, external: true },
  { label: 'Leaderboard', href: `${APP_URL}/leaderboard`, external: true },
];

/** Unified UpDown navbar (Trade mode) — same look as the app, minus the search. */
export function Navbar() {
  return (
    <header className="sticky top-0 z-[100] bg-surface-900">
      <div className="flex h-14 items-center justify-between px-3 sm:px-4 lg:px-6">
        {/* Left: logo + nav */}
        <div className="flex min-w-0 items-center gap-3 lg:gap-6">
          <a href={`${APP_URL}/`} className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/updown-logos/Logo_cyan_text_white.png" alt="UpDown" className="hidden h-8 sm:block" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/updown-logos/Logo_48px_Cyan_Transparent.png" alt="UpDown" className="block h-7 w-7 sm:hidden" />
          </a>
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l, i) => (
              <Fragment key={l.label}>
                <a
                  href={l.href}
                  className="rounded-md px-3 py-1.5 text-[0.85rem] font-semibold text-surface-400 transition-colors hover:bg-white/[0.03] hover:text-surface-100"
                >
                  {l.label}
                </a>
                {/* Trade dropdown sits right after Markets */}
                {i === 0 && <TradeModeMenu />}
              </Fragment>
            ))}
          </nav>
        </div>

        {/* Right: fund + level/coins + HL balance + notifications + wallet.
            Mode switch (Simple|Pro) lives in the account menu — see WalletMenu —
            so it's reachable on both desktop and mobile from one place. */}
        <div className="flex items-center gap-2">
          {/* Level + XP/coins chip — hidden on mobile (declutter the trade header;
              only money + notifications + wallet stay). */}
          <FundButton />
          <div className="hidden md:block">
            <ProfileStats />
          </div>
          <HeaderBalance />
          <NotificationBell />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
