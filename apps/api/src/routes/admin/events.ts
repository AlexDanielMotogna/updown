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
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Failed to fetch events' } });
  }
});
