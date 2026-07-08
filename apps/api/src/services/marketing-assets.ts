import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

/**
 * Marketing asset browser: every pool's topic (question) + its downloadable image(s)
 * so the marketing team can search/filter and grab artwork. Sports = team crests,
 * Polymarket = the market image, Crypto = the asset symbol (logo is a static app asset).
 */

export interface MarketingImage {
  label: string;
  url: string;
}
export interface MarketingAsset {
  id: string;
  type: string; // CRYPTO | SPORTS | POLYMARKET
  question: string;
  subtitle: string | null;
  category: string | null;
  subcategory: string | null;
  status: string;
  createdAt: string;
  images: MarketingImage[];
}

type Row = {
  id: string; poolType: string; asset: string; interval: string;
  homeTeam: string | null; awayTeam: string | null;
  homeTeamCrest: string | null; awayTeamCrest: string | null;
  league: string | null; subcategory: string | null; status: string; createdAt: Date;
};

function toAsset(p: Row): MarketingAsset {
  const images: MarketingImage[] = [];
  let question: string;
  let subtitle: string | null;

  if (p.poolType === 'SPORTS') {
    question = [p.homeTeam, p.awayTeam].filter(Boolean).join(' vs ') || 'Match';
    subtitle = p.league;
    if (p.homeTeamCrest) images.push({ label: p.homeTeam ?? 'Home', url: p.homeTeamCrest });
    if (p.awayTeamCrest) images.push({ label: p.awayTeam ?? 'Away', url: p.awayTeamCrest });
  } else if (p.poolType === 'POLYMARKET') {
    question = p.homeTeam ?? '(untitled market)';
    subtitle = p.subcategory ?? p.league;
    if (p.homeTeamCrest) images.push({ label: 'Market image', url: p.homeTeamCrest });
  } else {
    // CRYPTO — no per-pool artwork (asset logo is a static app icon).
    question = `${p.asset} ${p.interval}`;
    subtitle = 'Crypto price';
  }

  return {
    id: p.id, type: p.poolType, question, subtitle,
    category: p.league, subcategory: p.subcategory, status: p.status,
    createdAt: p.createdAt.toISOString(), images,
  };
}

export async function getMarketingAssets(opts: {
  type?: string; q?: string; category?: string; withImageOnly?: boolean; limit?: number; offset?: number;
}): Promise<{ assets: MarketingAsset[]; total: number }> {
  const where: Prisma.PoolWhereInput = {};
  if (opts.type) where.poolType = opts.type;
  if (opts.category) where.league = opts.category;
  if (opts.q) {
    const q = opts.q;
    where.OR = [
      { homeTeam: { contains: q, mode: 'insensitive' } },
      { awayTeam: { contains: q, mode: 'insensitive' } },
      { asset: { contains: q, mode: 'insensitive' } },
      { league: { contains: q, mode: 'insensitive' } },
      { subcategory: { contains: q, mode: 'insensitive' } },
    ];
  }
  const limit = Math.min(opts.limit ?? 60, 200);
  const [rows, total] = await Promise.all([
    prisma.pool.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: opts.offset ?? 0,
      select: {
        id: true, poolType: true, asset: true, interval: true,
        homeTeam: true, awayTeam: true, homeTeamCrest: true, awayTeamCrest: true,
        league: true, subcategory: true, status: true, createdAt: true,
      },
    }),
    prisma.pool.count({ where }),
  ]);

  let assets = rows.map(toAsset);
  if (opts.withImageOnly) assets = assets.filter((a) => a.images.length > 0);
  return { assets, total };
}

/** Distinct categories (leagues / PM buckets) for the filter dropdown. */
export async function getMarketingCategories(): Promise<{ type: string; category: string }[]> {
  const rows = await prisma.pool.findMany({
    where: { league: { not: null } },
    distinct: ['league'],
    select: { league: true, poolType: true },
    orderBy: { league: 'asc' },
  });
  return rows.filter((r) => r.league).map((r) => ({ type: r.poolType, category: r.league as string }));
}
