import { Router, type Router as RouterType } from 'express';
import { prisma } from '../db';
import { pushEnabled } from '../services/webpush';

export const notificationsRouter: RouterType = Router();

const MAX_NOTIFICATIONS = 50;

// GET /api/notifications?wallet=X - fetch unread + recent notifications
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

// PATCH /api/notifications/:id/read - mark single notification as read
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

// POST /api/notifications/read-all - mark all as read for a wallet
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

// ── Web Push ─────────────────────────────────────────────────────────────────

// GET /api/notifications/vapid-key - public VAPID key + whether push is enabled.
// The client needs the key to call pushManager.subscribe().
notificationsRouter.get('/vapid-key', (_req, res) => {
  res.json({
    success: true,
    data: { publicKey: process.env.VAPID_PUBLIC_KEY ?? null, enabled: pushEnabled() },
  });
});

// POST /api/notifications/subscribe - upsert a browser push subscription.
// Body: { wallet, subscription: { endpoint, keys: { p256dh, auth } }, userAgent? }
notificationsRouter.post('/subscribe', async (req, res) => {
  try {
    const { wallet, subscription, userAgent } = req.body as {
      wallet?: string;
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      userAgent?: string;
    };

    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!wallet || !endpoint || !p256dh || !auth) {
      return res.status(400).json({ success: false, error: 'wallet + full subscription required' });
    }

    // Keyed by endpoint (unique). Re-subscribing on the same device updates the
    // wallet/keys instead of creating a duplicate (e.g. after wallet switch).
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { walletAddress: wallet, endpoint, p256dh, auth, userAgent: userAgent ?? null },
      update: { walletAddress: wallet, p256dh, auth, userAgent: userAgent ?? null },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] subscribe failed:', (error as Error).message);
    res.status(500).json({ success: false, error: 'Failed to save subscription' });
  }
});

// POST /api/notifications/unsubscribe - remove a subscription by endpoint.
notificationsRouter.post('/unsubscribe', async (req, res) => {
  try {
    const endpoint = req.body.endpoint as string;
    if (!endpoint) return res.status(400).json({ success: false, error: 'endpoint required' });

    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to remove subscription' });
  }
});
