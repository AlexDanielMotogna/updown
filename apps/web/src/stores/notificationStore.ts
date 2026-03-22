import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error';

export type NotificationType =
  | 'POOL_WON'
  | 'POOL_LOST'
  | 'POOL_CLAIMABLE'
  | 'POOL_RESOLVED'
  | 'REFUND_RECEIVED'
  | 'DEPOSIT_SUCCESS'
  | 'DEPOSIT_FAILED'
  | 'CLAIM_SUCCESS'
  | 'CLAIM_FAILED'
  | 'XP_EARNED'
  | 'COINS_EARNED'
  | 'LEVEL_UP'
  | 'REFERRAL_CLAIM_SUCCESS'
  | 'REFERRAL_CLAIM_FAILED'
  | 'TOURNAMENT_MATCH_WON'
  | 'TOURNAMENT_MATCH_LOST'
  | 'TOURNAMENT_WON';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  poolId?: string;
  asset?: string;
  level?: number;
  autoHideDuration: number;
  createdAt: number;
  dismissed: boolean;       // read/dismissed in bell panel
  toastDismissed: boolean;  // toast auto-hidden (doesn't mark as read)
}

export type NotificationInput = Omit<Notification, 'id' | 'createdAt' | 'dismissed' | 'toastDismissed'>;

interface NotificationStore {
  notifications: Notification[];
  userPoolIds: Set<string>;
  push: (n: NotificationInput) => void;
  dismiss: (id: string) => void;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
  clear: () => void;
  addUserPoolId: (poolId: string) => void;
  setUserPoolIds: (ids: string[]) => void;
}

const MAX_HISTORY = 20;
const MAX_VISIBLE = 3;
const DEDUP_WINDOW_MS = 3000;

let counter = 0;

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      userPoolIds: new Set<string>(),

      push: (input) => {
        const now = Date.now();
        const existing = get().notifications;
        const isDupe = existing.some(
          (n) =>
            n.type === input.type &&
            n.poolId === input.poolId &&
            n.message === input.message &&
            now - n.createdAt < DEDUP_WINDOW_MS,
        );
        if (isDupe) return;

        const notification: Notification = {
          ...input,
          id: `notif-${now}-${++counter}`,
          createdAt: now,
          dismissed: false,
          toastDismissed: false,
        };

        set((state) => {
          const next = [notification, ...state.notifications];
          if (next.length > MAX_HISTORY) next.length = MAX_HISTORY;
          return { notifications: next };
        });
      },

      dismiss: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, dismissed: true, toastDismissed: true } : n,
          ),
        })),

      dismissToast: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, toastDismissed: true } : n,
          ),
        })),

      dismissAll: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, dismissed: true, toastDismissed: true })),
        })),

      clear: () =>
        set(() => ({
          notifications: [],
          userPoolIds: new Set<string>(),
        })),

      addUserPoolId: (poolId) =>
        set((state) => {
          if (state.userPoolIds.has(poolId)) return state;
          const next = new Set(state.userPoolIds);
          next.add(poolId);
          return { userPoolIds: next };
        }),

      setUserPoolIds: (ids) =>
        set(() => ({ userPoolIds: new Set(ids) })),
    }),
    {
      name: 'updown-notifications',
      storage: {
        getItem: (name) => {
          const raw = localStorage.getItem(name);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          const state = parsed?.state;
          if (state) {
            // Restore Set from array
            state.userPoolIds = new Set(state.userPoolIds || []);
            // Mark all toasts as dismissed so they don't re-appear on reload
            state.notifications = (state.notifications || []).map(
              (n: Notification) => ({ ...n, toastDismissed: true }),
            );
          }
          return parsed;
        },
        setItem: (name, value) => {
          // Convert Set to array for JSON serialization
          const state = { ...value.state };
          state.userPoolIds = Array.from(state.userPoolIds || []) as unknown as Set<string>;
          localStorage.setItem(name, JSON.stringify({ ...value, state }));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);

export { MAX_VISIBLE };
