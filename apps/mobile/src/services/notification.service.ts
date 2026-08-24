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

export interface NotificationPreferences {
  bookingUpdates: boolean;
  providerActivity: boolean;
  paymentAlerts: boolean;
  messages: boolean;
  sukiRewards: boolean;
  reminders: boolean;
  system: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimezone: string;
}

interface NotificationPreferencesResponse extends NotificationPreferences {
  promotions?: boolean;
  marketingPushEnabled?: boolean;
  marketingSmsEnabled?: boolean;
  marketingEmailEnabled?: boolean;
  marketingConsentAcknowledgedAt?: string | null;
  marketingConsentVersion?: number | null;
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  bookingUpdates: true,
  providerActivity: true,
  paymentAlerts: true,
  messages: true,
  sukiRewards: true,
  reminders: true,
  system: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  quietHoursTimezone: 'Asia/Manila',
};

function editablePreferences(
  value: Partial<NotificationPreferencesResponse>,
): NotificationPreferences {
  return {
    bookingUpdates: value.bookingUpdates ?? DEFAULT_NOTIFICATION_PREFERENCES.bookingUpdates,
    providerActivity: value.providerActivity ?? DEFAULT_NOTIFICATION_PREFERENCES.providerActivity,
    paymentAlerts: value.paymentAlerts ?? DEFAULT_NOTIFICATION_PREFERENCES.paymentAlerts,
    messages: value.messages ?? DEFAULT_NOTIFICATION_PREFERENCES.messages,
    sukiRewards: value.sukiRewards ?? DEFAULT_NOTIFICATION_PREFERENCES.sukiRewards,
    reminders: value.reminders ?? DEFAULT_NOTIFICATION_PREFERENCES.reminders,
    system: value.system ?? DEFAULT_NOTIFICATION_PREFERENCES.system,
    quietHoursEnabled: value.quietHoursEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.quietHoursEnabled,
    quietHoursStart: value.quietHoursStart ?? DEFAULT_NOTIFICATION_PREFERENCES.quietHoursStart,
    quietHoursEnd: value.quietHoursEnd ?? DEFAULT_NOTIFICATION_PREFERENCES.quietHoursEnd,
    quietHoursTimezone: value.quietHoursTimezone ?? DEFAULT_NOTIFICATION_PREFERENCES.quietHoursTimezone,
  };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await api.get<{ success: boolean; data: NotificationPreferencesResponse }>(
    '/api/v1/notifications/preferences',
  );
  return editablePreferences(res.data.data);
}

export async function updateNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  // Send only fields this screen owns. The API response also contains recorded
  // marketing-consent evidence; echoing that strict, read-only data back made
  // the old settings screen fail every save with a validation error.
  const normalized = editablePreferences(preferences);
  const payload: Partial<NotificationPreferences> = normalized.quietHoursEnabled
    ? normalized
    : {
        bookingUpdates: normalized.bookingUpdates,
        providerActivity: normalized.providerActivity,
        paymentAlerts: normalized.paymentAlerts,
        messages: normalized.messages,
        sukiRewards: normalized.sukiRewards,
        reminders: normalized.reminders,
        system: normalized.system,
        quietHoursEnabled: false,
      };
  const res = await api.put<{ success: boolean; data: NotificationPreferencesResponse }>(
    '/api/v1/notifications/preferences',
    payload,
  );
  return editablePreferences(res.data.data);
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
