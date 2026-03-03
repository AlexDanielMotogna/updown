import { create } from 'zustand';

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
  | 'CLAIM_FAILED';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  poolId?: string;
  asset?: string;
  autoHideDuration: number;
  createdAt: number;
  dismissed: boolean;
}

export type NotificationInput = Omit<Notification, 'id' | 'createdAt' | 'dismissed'>;

interface NotificationStore {
  notifications: Notification[];
  userPoolIds: Set<string>;
  push: (n: NotificationInput) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  addUserPoolId: (poolId: string) => void;
  setUserPoolIds: (ids: string[]) => void;
}

const MAX_HISTORY = 20;
const MAX_VISIBLE = 3;
const DEDUP_WINDOW_MS = 3000;

let counter = 0;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  userPoolIds: new Set<string>(),

  push: (input) => {
    // Deduplicate: ignore if same type + poolId was pushed within the last few seconds
    const now = Date.now();
    const existing = get().notifications;
    const isDupe = existing.some(
      (n) =>
        n.type === input.type &&
        n.poolId === input.poolId &&
        now - n.createdAt < DEDUP_WINDOW_MS,
    );
    if (isDupe) return;

    const notification: Notification = {
      ...input,
      id: `notif-${now}-${++counter}`,
      createdAt: now,
      dismissed: false,
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
        n.id === id ? { ...n, dismissed: true } : n,
      ),
    })),

  dismissAll: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, dismissed: true })),
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
}));

export { MAX_VISIBLE };
