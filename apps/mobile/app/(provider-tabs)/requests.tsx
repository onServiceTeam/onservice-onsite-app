// D38 Milestone 2 (package P5b): the provider Requests tab.
//
// Two lists: New requests (customer requests this pro may quote) and My
// quotes (what became of each quote this pro sent). ?tab=quotes opens My
// quotes (Routes.PROVIDER.MY_QUOTES, used by the "quote declined", "customer
// chose another pro" and "request cancelled" notification taps). Messages
// are reached from this header and from the dashboard, which keeps the tab
// bar at five tabs.
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MessageSquare } from '@/components/icons';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { Routes } from '@/config/navigation';
import { MyQuotesList, RequestInbox } from '@/components/provider/RequestInbox';
import { useProviderRequestSummary } from '@/hooks/useProviderRequestSummary';
import { useResponsive } from '@/hooks/useResponsive';

export type RequestsTab = 'requests' | 'quotes';

function tabFromParam(value: string | string[] | undefined): RequestsTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'quotes' ? 'quotes' : 'requests';
}

export interface RequestsScreenProps {
  /** The old /provider/leads link opens this screen on its own, with a back button. */
  showBack?: boolean;
}

export function RequestsScreen({ showBack = false }: RequestsScreenProps): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const paramTab = tabFromParam(params?.tab);
  const [tab, setTab] = useState<RequestsTab>(paramTab);
  // Inside the tabs the tab layout keeps the summary fresh. The old
  // /provider/leads link (showBack) can open outside the tabs, so there this
  // screen keeps it fresh itself.
  const { summary } = useProviderRequestSummary({ live: showBack });
  // The wide web app has its own side menu, so no back button there.
  const { isDesktop } = useResponsive();

  // A notification tap can open this tab with ?tab=quotes while it is already mounted.
  useEffect(() => { setTab(paramTab); }, [paramTab]);

  const choose = (next: RequestsTab): void => {
    setTab(next);
    try {
      router.setParams?.({ tab: next === 'quotes' ? 'quotes' : '' });
    } catch {
      // Not every navigator can set params; the local choice still holds.
    }
  };

  const segments: Array<{ value: RequestsTab; label: string }> = [
    { value: 'requests', label: summary.unseenCount > 0 ? `New requests (${summary.unseenCount})` : 'New requests' },
    { value: 'quotes', label: summary.quotesWaitingCount > 0 ? `My quotes (${summary.quotesWaitingCount})` : 'My quotes' },
  ];

  const segmentControl = (
    <View style={styles.segments} accessibilityRole="tablist">
      {segments.map((segment) => {
        const selected = tab === segment.value;
        return (
          <TouchableOpacity
            key={segment.value}
            style={[styles.segment, selected && styles.segmentSelected]}
            onPress={() => choose(segment.value)}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{segment.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          {showBack && !isDesktop ? (
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ChevronLeft size={24} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.title} accessibilityRole="header">Requests</Text>
          <TouchableOpacity
            onPress={() => router.push(Routes.PROVIDER.MESSAGES)}
            style={styles.messagesButton}
            accessibilityRole="button"
            accessibilityLabel="Open messages"
          >
            <MessageSquare size={18} color={colors.primary} />
            <Text style={styles.messagesText}>Messages</Text>
          </TouchableOpacity>
        </View>
      </View>
      {tab === 'quotes' ? <MyQuotesList header={segmentControl} /> : <RequestInbox header={segmentControl} />}
    </SafeAreaView>
  );
}

export default function ProviderRequestsTab(): React.ReactElement {
  return <RequestsScreen />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerInner: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h3, color: colors.text, flex: 1 },
  messagesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messagesText: { ...typography.bodySmall, fontWeight: '700', color: colors.primary },
  segments: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.md },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  segmentTextSelected: { color: colors.white },
});
