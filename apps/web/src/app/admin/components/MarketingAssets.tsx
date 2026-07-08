'use client';

import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { Download, Search } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, LoadingState, EmptyState } from '../ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface MarketingImage { label: string; url: string }
interface Asset {
  id: string; type: string; question: string; subtitle: string | null;
  category: string | null; subcategory: string | null; status: string; createdAt: string;
  images: MarketingImage[];
}

interface Category { code: string; label: string; type: string; badgeUrl: string }

const TYPES: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'SPORTS', label: 'Sports' },
  { key: 'POLYMARKET', label: 'Predictions' },
  { key: 'CRYPTO', label: 'Crypto' },
];

async function downloadImage(url: string, name: string) {
  try {
    // Same-origin app asset (e.g. /coins/btc-coin.png) — download directly, no proxy.
    if (url.startsWith('/')) {
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      return;
    }
    const proxy = `${API_BASE}/api/admin/marketing/image?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
    const res = await fetch(proxy, { headers: { 'x-admin-key': (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('admin-key')) || '' } });
    if (!res.ok) { console.warn('download failed', res.status); return; }
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = obj; a.download = name; a.click();
    URL.revokeObjectURL(obj);
  } catch (e) { console.warn('download error', e); }
}

function AssetCard({ a }: { a: Asset }) {
  const slug = a.question.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, borderRadius: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}` }}>
      {/* Images */}
      {a.images.length > 0 ? (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          {a.images.map((img, i) => (
            <Box
              key={i}
              onClick={() => downloadImage(img.url, `${slug}-${img.label.replace(/[^a-z0-9]+/gi, '-')}`)}
              title={`Download ${img.label}`}
              sx={{ position: 'relative', width: 72, height: 72, borderRadius: 1, overflow: 'hidden', cursor: 'pointer', bgcolor: t.bg.app, border: `1px solid ${t.border.subtle}`, '&:hover .dl': { opacity: 1 } }}
            >
              <Box component="img" src={img.url} alt={img.label} sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              <Box className="dl" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.55)', opacity: 0, transition: 'opacity 0.15s' }}>
                <Download sx={{ fontSize: 22, color: '#fff' }} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 1, bgcolor: t.bg.app, border: `1px dashed ${t.border.subtle}` }}>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>No image (crypto)</Typography>
        </Box>
      )}

      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.text.primary, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {a.question}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Box sx={{ px: 0.7, py: 0.1, borderRadius: '4px', bgcolor: t.hover.light }}>
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: t.text.secondary }}>{a.type}</Typography>
        </Box>
        {a.subtitle && <Typography sx={{ fontSize: '0.66rem', color: t.text.tertiary }}>{a.subtitle}</Typography>}
      </Box>

      {a.images.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, mt: 0.25 }}>
          {a.images.map((img, i) => (
            <Box key={i} component="button" onClick={() => downloadImage(img.url, `${slug}-${img.label.replace(/[^a-z0-9]+/gi, '-')}`)}
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', border: `1px solid ${t.border.medium}`, bgcolor: 'transparent', color: t.text.secondary, fontSize: '0.68rem', fontWeight: 600, '&:hover': { color: t.text.primary, borderColor: t.text.tertiary } }}>
              <Download sx={{ fontSize: 13 }} /> {img.label.length > 22 ? img.label.slice(0, 22) + '…' : img.label}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function CategoryBadge({ c }: { c: Category }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, p: 1.25, borderRadius: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}` }}>
      <Box onClick={() => downloadImage(c.badgeUrl, c.code)} title={`Download ${c.label}`}
        sx={{ position: 'relative', width: 64, height: 64, borderRadius: 1, overflow: 'hidden', cursor: 'pointer', bgcolor: t.bg.app, border: `1px solid ${t.border.subtle}`, '&:hover .dl': { opacity: 1 } }}>
        <Box component="img" src={c.badgeUrl} alt={c.label} sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        <Box className="dl" sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.55)', opacity: 0, transition: 'opacity 0.15s' }}>
          <Download sx={{ fontSize: 20, color: '#fff' }} />
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.primary, textAlign: 'center', lineHeight: 1.2 }}>{c.label}</Typography>
    </Box>
  );
}

export function MarketingAssets() {
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(id); }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketing', type, debounced],
    queryFn: () => adminFetch<{ data: { assets: Asset[]; total: number } }>(
      `/marketing/pools?limit=150${type ? `&type=${type}` : ''}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`,
    ),
  });
  const assets = data?.data.assets ?? [];
  const total = data?.data.total ?? 0;

  const catQ = useQuery({
    queryKey: ['admin-marketing-cats'],
    queryFn: () => adminFetch<{ data: Category[] }>('/marketing/categories'),
  });
  const cats = catQ.data?.data ?? [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <SectionCard title="Competition logos">
      <Typography sx={{ fontSize: '0.78rem', color: t.text.secondary, mb: 2 }}>
        League & competition badges (Champions League, World Cup, Premier League…). Click a logo to download it.
      </Typography>
      {catQ.isLoading ? (
        <LoadingState variant="block" />
      ) : cats.length === 0 ? (
        <EmptyState title="No category badges" />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(5, 1fr)', md: 'repeat(7, 1fr)', lg: 'repeat(9, 1fr)' }, gap: 1.5 }}>
          {cats.map((c) => <CategoryBadge key={c.code} c={c} />)}
        </Box>
      )}
    </SectionCard>

    <SectionCard title="Pool topics">
      <Typography sx={{ fontSize: '0.78rem', color: t.text.secondary, mb: 2 }}>
        Every pool topic with its downloadable artwork (sports crests, prediction market images). Search or filter by topic and click an image to download it.
      </Typography>

      {/* Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.6, borderRadius: 1, border: `1px solid ${t.border.medium}`, bgcolor: t.bg.app, flex: 1, minWidth: 220 }}>
          <Search sx={{ fontSize: 16, color: t.text.tertiary }} />
          <Box component="input" value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Search by team, league, market, asset…"
            sx={{ flex: 1, border: 'none', outline: 'none', bgcolor: 'transparent', color: t.text.primary, fontSize: '0.82rem', fontFamily: 'inherit', '&::placeholder': { color: t.text.tertiary } }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {TYPES.map((tp) => (
            <Box key={tp.key} onClick={() => setType(tp.key)}
              sx={{ px: 1.25, py: 0.6, borderRadius: '999px', cursor: 'pointer', bgcolor: type === tp.key ? t.hover.strong : t.hover.light, color: type === tp.key ? t.text.primary : t.text.tertiary, fontSize: '0.78rem', fontWeight: 700 }}>
              {tp.label}
            </Box>
          ))}
        </Box>
      </Box>

      {isLoading ? (
        <LoadingState variant="block" />
      ) : assets.length === 0 ? (
        <EmptyState title="No pools match this filter" />
      ) : (
        <>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary, mb: 1.5 }}>Showing {assets.length} of {total}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 1.5 }}>
            {assets.map((a) => <AssetCard key={a.id} a={a} />)}
          </Box>
        </>
      )}
    </SectionCard>
    </Box>
  );
}
