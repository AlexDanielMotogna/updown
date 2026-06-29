'use client';

/** Tiny inline price sparkline. Presentational: `points` come from the catalog's
 *  one batched /api/sparklines request (no per-card fetch). Green/red by net
 *  direction over the window. */
export function Sparkline({ points, width = 96, height = 28 }: { points?: number[]; width?: number; height?: number }) {
  const pts = points ?? [];
  if (pts.length < 2) return <div style={{ height }} className="w-full opacity-40" />;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const dx = width / (pts.length - 1);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * dx).toFixed(1)},${(height - ((p - min) / span) * height).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  const color = up ? '#26A69A' : '#EF5350'; // win-500 / loss-500

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" height={height} className="block w-full">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
