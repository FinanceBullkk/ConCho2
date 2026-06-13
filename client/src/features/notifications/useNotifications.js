import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// ──────────────────────────────────────────────────────────
// useNotifications — in-app notification bell (Cohesion P5).
// Self-scoped read feed over NotificationLog; polls so the unread badge
// stays fresh without a websocket. Email channel is unchanged.
// ──────────────────────────────────────────────────────────

const POLL_MS = 60_000;

// Returns the full envelope: { data: items, unreadCount, count }.
export const useMyNotifications = (options = {}) =>
  useQuery({
    queryKey: qk.notifications.mine,
    queryFn: async () => (await notificationsAPI.listMine()).data,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    ...options,
  });

export const useMarkNotificationRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => notificationsAPI.markRead(id).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
};

export const useMarkAllNotificationsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsAPI.markAllRead().then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
};
