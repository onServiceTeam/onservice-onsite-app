/**
 * D38 Milestone 2: a banner at the top of the app when a request, quote or
 * message notice arrives over the live connection (`notification:new`).
 *
 * Android phone push is still off (no Firebase project), so while the app is
 * open this banner is how a provider sees a new request and a customer sees a
 * new quote. It shows the stored notice's own title and text (the server
 * never puts message content or contact details in them).
 *
 * - Only request, quote and message types get a banner.
 * - No banner when the screen already shows that booking.
 * - A success vibration for the four "act now" types: a new or reopened
 *   request, a new quote and an accepted quote. utils/haptics respects the
 *   reduce-motion setting and does nothing on the web.
 * - A tap opens the same screen as tapping the phone notice
 *   (resolveNotificationRoute).
 *
 * Mounted once in app/_layout.tsx, after ToastProvider.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ExpoRouter from 'expo-router';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { REALTIME_EVENTS, type NotificationNewPayload } from '@/config/realtime-events';
import { resolveNotificationRoute } from '@/utils/notification-navigation';
import { BANNER_NOTICE_TYPES, HAPTIC_NOTICE_TYPES } from '@/utils/in-app-notice-types';
import { hapticSuccess } from '@/utils/haptics';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Bell, X } from '@/components/icons';

// The banner and vibration type lists live in utils/in-app-notice-types,
// shared with the foreground push handler.
export { BANNER_NOTICE_TYPES, HAPTIC_NOTICE_TYPES };

/** How long a banner stays before it hides itself. */
export const NOTICE_DISPLAY_MS = 6000;

type GlobalParams = () => Record<string, string | string[] | undefined>;
const routerGlobalParams = (ExpoRouter as unknown as { useGlobalSearchParams?: GlobalParams }).useGlobalSearchParams;
function useNoGlobalParams(): Record<string, string | string[] | undefined> {
  return {};
}
const useGlobalParamsSafe: GlobalParams = typeof routerGlobalParams === 'function' ? routerGlobalParams : useNoGlobalParams;

interface Notice {
  id: string;
  type: string;
  title: string;
  body: string;
  route: string | null;
}

function bookingIdOf(data: Record<string, unknown> | null | undefined): string | null {
  const value = data?.bookingId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function InAppNoticeHost(): React.ReactElement | null {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const params = useGlobalParamsSafe();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const [notice, setNotice] = useState<Notice | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback((): void => {
    clearTimer();
    setNotice(null);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  useSocketEvent<NotificationNewPayload>(REALTIME_EVENTS.NOTIFICATION_NEW, (payload) => {
    if (!payload || typeof payload.type !== 'string') return;
    // The bell count and list are re-read either way.
    void queryClient.invalidateQueries({ queryKey: ['notifUnread'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (role !== 'customer' && role !== 'provider') return;
    if (!BANNER_NOTICE_TYPES.has(payload.type)) return;

    const bookingId = bookingIdOf(payload.data);
    if (bookingId) {
      const onScreen = pathname.includes(bookingId)
        || params.bookingId === bookingId
        || params.id === bookingId;
      // A message from a different pro on the same booking is still news.
      const otherPro = typeof payload.data?.providerUserId === 'string'
        && typeof params.provider === 'string'
        && params.provider !== payload.data.providerUserId;
      if (onScreen && !otherPro) return;
    }

    const route = resolveNotificationRoute(payload.type, payload.data ?? {}, role);
    clearTimer();
    setNotice({
      id: payload.id,
      type: payload.type,
      title: payload.title || 'onService',
      body: payload.body || '',
      route,
    });
    timerRef.current = setTimeout(() => setNotice(null), NOTICE_DISPLAY_MS);
    if (HAPTIC_NOTICE_TYPES.has(payload.type)) void hapticSuccess();
  });

  if (!notice) return null;

  const open = (): void => {
    const route = notice.route;
    dismiss();
    if (route) router.push(route as never);
  };

  return (
    <View style={[styles.wrap, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <TouchableOpacity
          style={styles.body}
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${notice.title}. ${notice.body}`}
          accessibilityHint={notice.route ? 'Opens the related screen' : undefined}
        >
          <Bell size={18} color={colors.primary} />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>{notice.title}</Text>
            {notice.body ? <Text style={styles.message} numberOfLines={2}>{notice.body}</Text> : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.close}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notice"
        >
          <X size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 100, elevation: 12, alignItems: 'center' },
  banner: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, minHeight: 56 },
  text: { flex: 1 },
  title: { ...typography.body, fontWeight: '700', color: colors.text },
  message: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

export default InAppNoticeHost;
