import React from 'react';
import { NotificationPreferencesScreen } from '@/components/notifications/NotificationPreferencesScreen';

export default function CustomerNotificationSettingsScreen(): React.ReactElement {
  return <NotificationPreferencesScreen persona="customer" />;
}
