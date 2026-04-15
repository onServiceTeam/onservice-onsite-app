import api from './api';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationListResponse {
  success: boolean;
  data: Notification[];
  meta: {
    total: number;
    unread: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export async function getNotifications(
  page = 1,
  pageSize = 20,
): Promise<{ notifications: Notification[]; total: number; unread: number }> {
  const res = await api.get<NotificationListResponse>('/api/v1/notifications', {
    params: { page, pageSize },
  });
  return {
    notifications: res.data.data,
    total: res.data.meta.total,
    unread: res.data.meta.unread,
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/api/v1/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await api.post<{ success: boolean; data: { markedRead: number } }>(
    '/api/v1/notifications/read-all',
  );
  return res.data.data.markedRead;
}
