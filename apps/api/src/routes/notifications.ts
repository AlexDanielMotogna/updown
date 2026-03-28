import { Router, type Router as RouterType } from 'express';
import { prisma } from '../db';

export const notificationsRouter: RouterType = Router();

const MAX_NOTIFICATIONS = 50;

// GET /api/notifications?wallet=X — fetch unread + recent notifications
notificationsRouter.get('/', async (req, res) => {
  try {
    const wallet = req.query.wallet as string;
    if (!wallet) return res.status(400).json({ success: false, error: 'wallet required' });

    const notifications = await prisma.notification.findMany({
      where: { walletAddress: wallet },
      orderBy: { createdAt: 'desc' },
      take: MAX_NOTIFICATIONS,
    });

    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/:id/read — mark single notification as read
notificationsRouter.patch('/:id/read', async (req, res) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    res.json({ success: true });
  } catch {
    res.status(404).json({ success: false, error: 'Notification not found' });
  }
});

// POST /api/notifications/read-all — mark all as read for a wallet
notificationsRouter.post('/read-all', async (req, res) => {
  try {
    const wallet = req.body.wallet as string;
    if (!wallet) return res.status(400).json({ success: false, error: 'wallet required' });

    await prisma.notification.updateMany({
      where: { walletAddress: wallet, read: false },
      data: { read: true },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to mark notifications as read' });
  }
});
