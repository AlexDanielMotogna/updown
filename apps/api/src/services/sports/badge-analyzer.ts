import { PNG } from 'pngjs';

/**
 * Pick a background classification for a category badge by sampling the
 * non-transparent pixels of the source image and looking at their average
 * perceived luminance.
 *
 *   - 'dark'   — content is bright (white-on-transparent logos, light
 *                vectors). Render on a dark surface.
 *   - 'light'  — content is dark (black-on-transparent crests, dark
 *                vectors). Render on a light surface (the historical
 *                default).
 *   - null     — couldn't decide (image fetch failed, not a PNG, or no
 *                opaque pixels). Frontend falls through to its default.
 *
 * Only PNG is supported because every TheSportsDB badge URL we've seen is
 * a PNG and pngjs is pure-JS / no-native-deps (Windows-friendly). JPEG /
 * WebP fall through to `null` instead of throwing — the operator can
 * still override manually in the Categories edit dialog.
 *
 * Used by /admin/sports/sdb-league/:id so the admin Browse-SDB-+Add and
 * sidebar 'fetch badge' flows persist the classification automatically.
 */
export async function classifyBadgeBackground(badgeUrl: string): Promise<'light' | 'dark' | null> {
  if (!badgeUrl) return null;
  if (!/\.png(?:$|\?)/i.test(badgeUrl)) return null; // PNG-only

  let buffer: Buffer;
  try {
    const res = await fetch(badgeUrl, { headers: { 'User-Agent': 'updown-admin' } });
    if (!res.ok) return null;
    buffer = Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }

  let png: PNG;
  try {
    png = await new Promise<PNG>((resolve, reject) => {
      const p = new PNG();
      p.parse(buffer, (err, data) => err ? reject(err) : resolve(data));
    });
  } catch {
    return null;
  }

  const { width, height, data } = png;
  if (width === 0 || height === 0) return null;

  // Sample a 9-point grid: center + 4 mid-edges + 4 mid-corners. For each
  // point average a 7×7 window so single-pixel anti-aliasing doesn't
  // dominate. Skip pixels with alpha < 128 — most badges have a
  // transparent background and we only care about content luminance.
  const POINTS: Array<[number, number]> = [
    [0.5, 0.5],
    [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75],
    [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75],
  ];
  const RADIUS = 3;

  const samples: number[] = [];
  for (const [fx, fy] of POINTS) {
    const cx = Math.floor(fx * width);
    const cy = Math.floor(fy * height);
    let sumLuma = 0;
    let count = 0;
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const idx = ((width * y) + x) << 2;
        const a = data[idx + 3];
        if (a < 128) continue;
        // Rec. 709 relative luminance approximation in 0..255 space.
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        sumLuma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        count++;
      }
    }
    if (count > 0) samples.push(sumLuma / count);
  }

  if (samples.length === 0) return null;
  const avg = samples.reduce((s, n) => s + n, 0) / samples.length;

  // Thresholds tuned against SDB's badge catalog (~1,500 leagues): white-
  // dominant logos cluster above ~210, dark crests cluster below ~95.
  // The 110–210 zone is mixed (colorful crests on transparent) where
  // either background works fine, so leave null and let the frontend
  // default kick in.
  if (avg > 210) return 'dark';
  if (avg < 95) return 'light';
  return null;
}
