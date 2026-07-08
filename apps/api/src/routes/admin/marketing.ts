import { Router, type Router as RouterType } from 'express';
import { getMarketingAssets, getMarketingCategories } from '../../services/marketing-assets';

/** Admin: marketing asset browser (pool topics + downloadable images). */
export const adminMarketingRouter: RouterType = Router();

/** GET /api/admin/marketing/pools?type=&q=&category=&limit=&offset= */
adminMarketingRouter.get('/pools', async (req, res) => {
  try {
    const type = typeof req.query.type === 'string' && req.query.type ? req.query.type : undefined;
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : undefined;
    const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    res.json({ success: true, data: await getMarketingAssets({ type, q, category, limit, offset }) });
  } catch (error) {
    console.error('[Admin Marketing] pools error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load assets' } });
  }
});

/** GET /api/admin/marketing/categories — distinct leagues/PM buckets for the filter. */
adminMarketingRouter.get('/categories', async (_req, res) => {
  try {
    res.json({ success: true, data: await getMarketingCategories() });
  } catch (error) {
    console.error('[Admin Marketing] categories error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load categories' } });
  }
});

// Only proxy images from the known providers (crests + Polymarket art). Prevents SSRF.
function hostAllowed(host: string): boolean {
  return (
    host === 'r2.thesportsdb.com' ||
    host.endsWith('.thesportsdb.com') ||
    host.startsWith('polymarket-upload.s3') ||
    host === 'imagedelivery.net' ||
    host.endsWith('.imagedelivery.net') ||
    host.endsWith('.polymarket.com') ||
    host === 'app.pacifica.fi' ||
    host.endsWith('.pacifica.fi')
  );
}
const EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' };

/** GET /api/admin/marketing/image?url=&name= — proxy-download an image (bypasses CORS). */
adminMarketingRouter.get('/image', async (req, res) => {
  const raw = String(req.query.url ?? '');
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return res.status(400).json({ error: 'Invalid url' }); }
  if (parsed.protocol !== 'https:' || !hostAllowed(parsed.hostname)) {
    return res.status(403).json({ error: 'Image host not allowed' });
  }
  try {
    const r = await fetch(parsed.toString());
    if (!r.ok) return res.status(502).json({ error: `Upstream ${r.status}` });
    const ct = r.headers.get('content-type') ?? 'image/png';
    const buf = Buffer.from(await r.arrayBuffer());
    const base = (typeof req.query.name === 'string' && req.query.name ? req.query.name : 'asset').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80);
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `attachment; filename="${base}${EXT[ct] ?? ''}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buf);
  } catch (error) {
    console.error('[Admin Marketing] image proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});
