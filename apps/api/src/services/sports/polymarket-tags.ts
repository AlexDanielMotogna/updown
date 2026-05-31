/**
 * Polymarket (Gamma) tag taxonomy helpers - power the admin's "source tags"
 * picker so subcategory filters come from PM's REAL related-tags, not free text.
 *
 *  - resolveTagById/BySlug: id/slug -> { id, label, slug } (cached; labels are stable).
 *  - getRelatedTags(tagId): PM's official ranked sub-tags for a category tag.
 *  - tagBySlug(name): resolve a typed category tag name -> id (slugified).
 *
 * Labels are English (e.g. "Iran", "Oil"); the polymarket.com UI localizes them.
 */
const GAMMA = 'https://gamma-api.polymarket.com';
const RELATED_TTL_MS = 60 * 60 * 1000; // related-tags cached 1h

interface TagRec { id: string; label: string; slug: string }

const labelCache = new Map<string, TagRec>();                       // id -> tag (labels are stable)
const relatedCache = new Map<string, { at: number; data: Array<TagRec & { rank: number }> }>();

async function gget(path: string): Promise<any> {
  const res = await fetch(`${GAMMA}${path}`, { headers: { 'User-Agent': 'updown-admin' } });
  if (!res.ok) throw new Error(`Gamma ${res.status} ${res.statusText}`);
  return res.json();
}

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function resolveTagById(id: string): Promise<TagRec | null> {
  const key = String(id);
  if (labelCache.has(key)) return labelCache.get(key)!;
  try {
    const t = await gget(`/tags/${key}`);
    if (!t?.id) return null;
    const rec: TagRec = { id: String(t.id), label: t.label, slug: t.slug };
    labelCache.set(rec.id, rec);
    return rec;
  } catch {
    return null;
  }
}

/** Resolve a category tag by typed name (slugified). Returns null if PM has no such tag. */
export async function tagBySlug(name: string): Promise<TagRec | null> {
  try {
    const t = await gget(`/tags/slug/${slugify(name)}`);
    if (!t?.id) return null;
    const rec: TagRec = { id: String(t.id), label: t.label, slug: t.slug };
    labelCache.set(rec.id, rec);
    return rec;
  } catch {
    return null;
  }
}

/** PM's official ranked sub-tags for a parent tag (e.g. Geopolitics -> Iran, Oil, ...). */
export async function getRelatedTags(tagId: string): Promise<Array<TagRec & { rank: number }>> {
  const key = String(tagId);
  const cached = relatedCache.get(key);
  if (cached && Date.now() - cached.at < RELATED_TTL_MS) return cached.data;

  let rels: Array<{ relatedTagID: number; rank: number }>;
  try {
    rels = await gget(`/tags/${key}/related-tags`);
  } catch {
    return [];
  }
  if (!Array.isArray(rels)) return [];

  const out: Array<TagRec & { rank: number }> = [];
  for (const r of [...rels].sort((a, b) => a.rank - b.rank)) {
    const t = await resolveTagById(String(r.relatedTagID));
    if (t) out.push({ ...t, rank: r.rank });
  }
  relatedCache.set(key, { at: Date.now(), data: out });
  return out;
}

// ── Active tag list (for the admin "Add Polymarket tag" picker) ──────────────
let activeTagsCache: { at: number; data: Array<TagRec & { count: number }> } | null = null;
const ACTIVE_TTL_MS = 60 * 60 * 1000;

/**
 * Tags that appear on currently-active, high-volume Polymarket events - i.e. the
 * tags that would actually produce pools. Aggregated from the top events by
 * volume (a few pages), deduped by id, ranked by how many events carry the tag.
 * This is the clean, pickable list for the admin (vs the 1200+ noisy /tags).
 */
export async function getActiveTags(): Promise<Array<TagRec & { count: number }>> {
  if (activeTagsCache && Date.now() - activeTagsCache.at < ACTIVE_TTL_MS) return activeTagsCache.data;
  const byId = new Map<string, TagRec & { count: number }>();
  let offset = 0;
  for (let i = 0; i < 4; i++) {
    let page: any;
    try {
      page = await gget(`/events?active=true&closed=false&order=volume&ascending=false&limit=100&offset=${offset}`);
    } catch {
      break;
    }
    if (!Array.isArray(page) || page.length === 0) break;
    for (const ev of page) {
      for (const t of (ev.tags || [])) {
        if (!t?.label || !t?.id) continue;
        const id = String(t.id);
        const prev = byId.get(id);
        if (prev) prev.count++;
        else {
          const rec = { id, label: t.label, slug: t.slug || '', count: 1 };
          byId.set(id, rec);
          labelCache.set(id, { id, label: t.label, slug: t.slug || '' });
        }
      }
    }
    if (page.length < 100) break;
    offset += 100;
  }
  const data = [...byId.values()].sort((a, b) => b.count - a.count);
  if (data.length > 0) activeTagsCache = { at: Date.now(), data };
  return data;
}

/** Merge related-tags across several parent tag ids, dedup by id, keep best (min) rank. */
export async function getRelatedTagsForMany(tagIds: string[]): Promise<Array<TagRec & { rank: number }>> {
  const byId = new Map<string, TagRec & { rank: number }>();
  for (const tid of tagIds) {
    for (const t of await getRelatedTags(tid)) {
      const prev = byId.get(t.id);
      if (!prev || t.rank < prev.rank) byId.set(t.id, t);
    }
  }
  return [...byId.values()].sort((a, b) => a.rank - b.rank);
}
