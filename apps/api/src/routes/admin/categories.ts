import { Router, type Router as RouterType } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { invalidateCache } from '../../services/category-config';

export const adminCategoriesRouter: RouterType = Router();

/**
 * Map a thrown error to a known error code + safe public message. Avoids
 * leaking Prisma internals (e.g. table names, internal constraint identifiers)
 * to the client. Raw error stays in stderr for diagnostics.
 * See PLAN-ADMIN-REFACTOR.md Phase 1 #17.
 */
function safeErrorResponse(action: string, err: unknown): { status: number; body: { success: false; error: { code: string; message: string } } } {
  console.error(`[admin-categories] ${action} failed:`, err);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return { status: 409, body: { success: false, error: { code: 'DUPLICATE', message: 'A category with this code already exists' } } };
    if (err.code === 'P2025') return { status: 404, body: { success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } } };
    if (err.code === 'P2003') return { status: 409, body: { success: false, error: { code: 'FK_CONSTRAINT', message: 'Action blocked by a database constraint' } } };
  }
  return { status: 400, body: { success: false, error: { code: action.toUpperCase().replace(/-/g, '_') + '_ERROR', message: 'Operation failed' } } };
}

// GET /api/admin/categories - all categories (including disabled)
adminCategoriesRouter.get('/', async (_req, res) => {
  try {
    const categories = await prisma.poolCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, data: categories });
  } catch (err) {
    const { status, body } = safeErrorResponse('fetch', err);
    res.status(status).json(body);
  }
});

// POST /api/admin/categories - create new category
adminCategoriesRouter.post('/', async (req, res) => {
  try {
    const category = await prisma.poolCategory.create({ data: req.body });
    invalidateCache();
    res.json({ success: true, data: category });
  } catch (err) {
    const { status, body } = safeErrorResponse('create', err);
    res.status(status).json(body);
  }
});

// PUT /api/admin/categories/:id - update category
adminCategoriesRouter.put('/:id', async (req, res) => {
  try {
    const category = await prisma.poolCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });
    invalidateCache();
    res.json({ success: true, data: category });
  } catch (err) {
    const { status, body } = safeErrorResponse('update', err);
    res.status(status).json(body);
  }
});

// PATCH /api/admin/categories/:id/toggle - enable/disable
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
  } catch (err) {
    const { status, body } = safeErrorResponse('toggle', err);
    res.status(status).json(body);
  }
});

// PATCH /api/admin/categories/:id/coming-soon - toggle comingSoon
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
  } catch (err) {
    const { status, body } = safeErrorResponse('toggle', err);
    res.status(status).json(body);
  }
});

// DELETE /api/admin/categories/:id
adminCategoriesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.poolCategory.delete({ where: { id: req.params.id } });
    invalidateCache();
    res.json({ success: true });
  } catch (err) {
    const { status, body } = safeErrorResponse('delete', err);
    res.status(status).json(body);
  }
});
