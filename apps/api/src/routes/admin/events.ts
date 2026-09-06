import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';

export const adminEventsRouter: RouterType = Router();

const eventsFilterSchema = z.object({
  eventType: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

// GET /events/admin-actions — the actor-stamped trail written by the
// auditAdminActions middleware.
//
// Separate from the EventLog reader above because it answers a different
// question: not "what happened to this pool" but "who did this, with which
// credential, from where". Filter by `keyFingerprint` to scope an incident to
// one credential, or by `statusCode=401` to see attempts that never
// authenticated.
const adminActionsFilterSchema = z.object({
  keyFingerprint: z.string().max(32).optional(),
  role: z.enum(['super', 'marketing', 'readonly']).optional(),
  ip: z.string().max(64).optional(),
  method: z.string().max(10).optional(),
  path: z.string().max(512).optional(),
  statusCode: z.coerce.number().int().min(100).max(599).optional(),
  since: z.coerce.date().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

adminEventsRouter.get('/admin-actions', async (req, res) => {
  try {
    const parsed = adminActionsFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.flatten() } });
    }

    const { keyFingerprint, role, ip, method, path, statusCode, since, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (keyFingerprint) where.keyFingerprint = keyFingerprint;
    if (role) where.role = role;
    if (ip) where.ip = ip;
    if (method) where.method = method.toUpperCase();
    if (path) where.path = { contains: path };
    if (statusCode) where.statusCode = statusCode;
    if (since) where.createdAt = { gte: since };

    const [actions, total] = await Promise.all([
      prisma.adminAction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.adminAction.count({ where }),
    ]);

    res.json({
      success: true,
      data: actions.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin admin-actions error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Failed to fetch admin actions' } });
  }
});

adminEventsRouter.get('/', async (req, res) => {
  try {
    const parsed = eventsFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: parsed.error.flatten() } });
    }

    const { eventType, entityType, entityId, page, limit } = parsed.data;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (eventType) where.eventType = eventType;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [events, total] = await Promise.all([
      prisma.eventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.eventLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: events.map(e => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin events error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Failed to fetch events' } });
  }
});
