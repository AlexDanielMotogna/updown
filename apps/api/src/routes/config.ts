import { Router, type Router as RouterType } from 'express';
import { getVisibleCategories } from '../services/category-config';

export const configRouter: RouterType = Router();

// GET /api/config/categories — public, returns enabled + comingSoon categories
configRouter.get('/categories', async (_req, res) => {
  try {
    const categories = await getVisibleCategories();
    res.json({
      success: true,
      data: categories.map(c => ({
        code: c.code,
        type: c.type,
        enabled: c.enabled,
        comingSoon: c.comingSoon,
        label: c.label,
        shortLabel: c.shortLabel,
        color: c.color,
        badgeUrl: c.badgeUrl,
        iconKey: c.iconKey,
        numSides: c.numSides,
        sideLabels: c.sideLabels,
        sortOrder: c.sortOrder,
      })),
    });
  } catch {
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch categories' } });
  }
});
