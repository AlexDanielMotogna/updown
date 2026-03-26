import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db';
import { invalidateCache } from '../../services/category-config';

export const adminCategoriesRouter: RouterType = Router();

// GET /api/admin/categories — all categories (including disabled)
adminCategoriesRouter.get('/', async (_req, res) => {
  try {
    const categories = await prisma.poolCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, data: categories });
  } catch {
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch categories' } });
  }
});

// POST /api/admin/categories — create new category
adminCategoriesRouter.post('/', async (req, res) => {
  try {
    const category = await prisma.poolCategory.create({ data: req.body });
    invalidateCache();
    res.json({ success: true, data: category });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'CREATE_ERROR', message: err.message } });
  }
});

// PUT /api/admin/categories/:id — update category
adminCategoriesRouter.put('/:id', async (req, res) => {
  try {
    const category = await prisma.poolCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });
    invalidateCache();
    res.json({ success: true, data: category });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'UPDATE_ERROR', message: err.message } });
  }
});

// PATCH /api/admin/categories/:id/toggle — enable/disable
adminCategoriesRouter.patch('/:id/toggle', async (req, res) => {
  try {
    const current = await prisma.poolCategory.findUnique({ where: { id: req.params.id } });
    if (!current) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }

    const category = await prisma.poolCategory.update({
      where: { id: req.params.id },
      data: { enabled: !current.enabled },
    });
    invalidateCache();
    res.json({ success: true, data: category });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'TOGGLE_ERROR', message: err.message } });
  }
});

// PATCH /api/admin/categories/:id/coming-soon — toggle comingSoon
adminCategoriesRouter.patch('/:id/coming-soon', async (req, res) => {
  try {
    const current = await prisma.poolCategory.findUnique({ where: { id: req.params.id } });
    if (!current) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
    }

    const category = await prisma.poolCategory.update({
      where: { id: req.params.id },
      data: { comingSoon: !current.comingSoon },
    });
    invalidateCache();
    res.json({ success: true, data: category });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'TOGGLE_ERROR', message: err.message } });
  }
});

// DELETE /api/admin/categories/:id
adminCategoriesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.poolCategory.delete({ where: { id: req.params.id } });
    invalidateCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'DELETE_ERROR', message: err.message } });
  }
});
