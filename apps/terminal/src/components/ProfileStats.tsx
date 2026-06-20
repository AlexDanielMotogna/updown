'use client';

import { useEffect, useState } from 'react';
import { useIdentity } from '@/hooks/useIdentity';
import { fetchProfile, type UserProfile } from '@/lib/api';
import { UserLevelBadge } from './UserLevelBadge';

const UP_COINS_DIVISOR = 100;

function fmtCoins(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(1);
}

/** Level icon + UP coins chip for the terminal navbar (mirrors the app header). */
export function ProfileStats() {
  const { walletAddress } = useIdentity();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!walletAddress) { setProfile(null); return; }
    let alive = true;
    const load = () => fetchProfile(walletAddress).then((p) => alive && setProfile(p));
    load();
    const id = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [walletAddress]);

  if (!profile) return null;

  return (
    <div className="flex h-[38px] items-center overflow-hidden rounded-md bg-white/[0.06]">
      {/* Level icon */}
      <div className="flex h-full items-center border-r border-white/[0.06] px-2" title={`Lv.${profile.level} ${profile.title}`}>
        <UserLevelBadge level={profile.level} title={profile.title} size="sm" variant="icon-only" />
      </div>
      {/* UP coins */}
      <div className="flex h-full items-center gap-1 px-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/token/Token_16px_Gold.png" alt="UP" className="h-3.5 w-3.5" />
        <span className="text-sm font-semibold tabular text-surface-100">
          {fmtCoins(Number(profile.coinsBalance) / UP_COINS_DIVISOR)}
        </span>
      </div>
    </div>
  );
}
