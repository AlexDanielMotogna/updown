import webpush from 'web-push';
import { prisma } from '../db';

/**
 * Web Push delivery. Sits alongside the DB-notification writes in
 * services/notifications.ts — the same event that persists a Notification row
 * also fires a push here (fire-and-forget, never blocks pool resolution).
 *
 * Disabled silently when VAPID env is absent (dev without keys, or before the
 * keys are set in Railway) — DB notifications keep working regardless.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@updown.my';

const enabled = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (enabled) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
} else {
  console.warn('[WebPush] VAPID keys not set — push notifications disabled (DB notifications unaffected).');
}

export function pushEnabled(): boolean {
  return enabled;
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open on click, e.g. /pool/<id> or /match/<id>. */
  url?: string;
  /** Collapse key — a newer push with the same tag replaces the old one. */
  tag?: string;
}

/**
 * Send a push to every subscription (device) registered for a wallet.
 * Prunes subscriptions the push service reports as gone (404/410).
 * Best-effort: any error is swallowed so callers can fire-and-forget.
 */
export async function sendPushToWallet(walletAddress: string, payload: PushPayload): Promise<void> {
  if (!enabled) return;

  try {
    const subs = await prisma.pushSubscription.findMany({ where: { walletAddress } });
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    const stale: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404 Not Found / 410 Gone → the browser dropped the subscription.
          if (status === 404 || status === 410) {
            stale.push(sub.endpoint);
          } else {
            console.error(`[WebPush] send failed (${status ?? 'network'}) for ${walletAddress.slice(0, 8)}…:`, (err as Error).message);
          }
        }
      }),
    );

    if (stale.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: stale } } });
      console.log(`[WebPush] Pruned ${stale.length} stale subscription(s).`);
    }
  } catch (err) {
    console.error('[WebPush] sendPushToWallet error:', (err as Error).message);
  }
}
