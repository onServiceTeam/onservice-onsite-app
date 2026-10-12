import React from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname } from 'expo-router';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { MessageSquare, ChevronRight } from '@/components/icons';
import { installedVersion } from '@/services/app-update.service';
import { resolveAppVersion } from '@/config/app-version';
import { showToast } from '@/lib/toast';

/**
 * "Send feedback" inside the app (tester feedback v2, build step 4 of
 * docs/qa/ux-testing/FEEDBACK-V2-AUDIT-AND-PLAN-2026-10-12.md).
 *
 * Opens the tester feedback page straight on its "Report a problem" form and
 * tells it which screen the person was on, which app version they run and
 * whether they use the installed app or a browser, so the tester does not have
 * to type any of that.
 *
 * The feedback page is a static page on the web app's own domain, not an API
 * route, and the app has no config value for the web app's address (the API
 * address differs per build: localhost in development, app.onservice.ph or
 * api.onservice.ph in the release profiles). So the address is a constant,
 * the same way TurnstileModal pins https://app.onservice.ph.
 */
export const FEEDBACK_PAGE_URL = 'https://app.onservice.ph/feedback';

/** The API stores at most 200 characters of the screen route. */
const MAX_SCREEN_LENGTH = 200;

export type FeedbackSurface = 'apk' | 'browser';

/** Everything that sends people to the tester feedback page (the floating
 * "Feedback" button and the rows on Help and Settings) is only for tester
 * builds, so production builds never send real customers and providers into
 * the tester study. Set EXPO_PUBLIC_TESTER_FEEDBACK=1 when building the
 * tester web app and APK. */
export function isTesterFeedbackEnabled(): boolean {
  return process.env.EXPO_PUBLIC_TESTER_FEEDBACK === '1';
}

/** The same version the app shows (resolveAppVersion), plus the build
 * number when the installed app reports one, e.g. "1.0.1 (build 2)". */
export function feedbackAppVersion(): string | null {
  const version = resolveAppVersion();
  if (!version) return null;
  const build = installedVersion().versionCode;
  return build !== null ? `${version} (build ${build})` : version;
}

/** The feedback API only knows "apk" and "browser". iOS has no tester build. */
export function feedbackSurface(): FeedbackSurface | null {
  if (Platform.OS === 'web') return 'browser';
  if (Platform.OS === 'android') return 'apk';
  return null;
}

export function buildFeedbackUrl(input: {
  screen?: string | null;
  appVersion?: string | null;
  surface?: FeedbackSurface | null;
}): string {
  const params: [string, string][] = [['report', '1']];
  const screen = input.screen?.trim();
  if (screen) params.push(['screen', screen.slice(0, MAX_SCREEN_LENGTH)]);
  if (input.appVersion) params.push(['app', input.appVersion]);
  if (input.surface) params.push(['surface', input.surface]);
  // Built by hand: URLSearchParams is incomplete in some React Native runtimes.
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `${FEEDBACK_PAGE_URL}?${query}`;
}

const FALLBACK_MESSAGE = 'Open app.onservice.ph/feedback in your browser to send feedback.';

/** Web: a new tab, so the app stays open where the person was. Installed
 * app: the phone's browser. */
export function openFeedbackPage(screen: string | null | undefined): void {
  const url = buildFeedbackUrl({ screen, appVersion: feedbackAppVersion(), surface: feedbackSurface() });
  if (Platform.OS === 'web') {
    const opened = typeof window !== 'undefined' && typeof window.open === 'function'
      ? window.open(url, '_blank')
      : null;
    if (opened) {
      // Same protection as rel="noopener": the feedback tab cannot reach back
      // into the app tab.
      try { opened.opener = null; } catch { /* some browsers make it read-only */ }
      return;
    }
    showToast(FALLBACK_MESSAGE, 'info');
    return;
  }
  Linking.openURL(url).catch(() => { showToast(FALLBACK_MESSAGE, 'info'); });
}

export const SEND_FEEDBACK_LABEL = 'Send feedback or report a problem';
export const SEND_FEEDBACK_HINT = 'Opens the feedback page in your browser';

interface SendFeedbackLinkProps {
  /** "card" matches the contact buttons on the Help screens; "row" matches
   * the rows on provider Settings. */
  variant?: 'card' | 'row';
  /** Row variant: drop the divider when it is the last row of its group. */
  last?: boolean;
}

/** Renders nothing outside tester builds (see isTesterFeedbackEnabled). */
export default function SendFeedbackLink({ variant = 'card', last = false }: SendFeedbackLinkProps): React.ReactElement | null {
  const pathname = usePathname();
  if (!isTesterFeedbackEnabled()) return null;
  const onPress = (): void => openFeedbackPage(pathname);

  if (variant === 'row') {
    return (
      <TouchableOpacity
        style={[styles.row, last && styles.rowLast]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={SEND_FEEDBACK_LABEL}
        accessibilityHint={SEND_FEEDBACK_HINT}
        testID="send-feedback-link"
      >
        <View style={styles.rowLabelGroup}>
          <Text style={styles.rowLabel}>{SEND_FEEDBACK_LABEL}</Text>
          <Text style={styles.rowHint}>Opens our feedback page</Text>
        </View>
        <Text style={styles.rowArrow}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={SEND_FEEDBACK_LABEL}
      accessibilityHint={SEND_FEEDBACK_HINT}
      testID="send-feedback-link"
    >
      <View style={styles.cardIconWrap}><MessageSquare size={22} color={colors.primary} /></View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardLabel}>{SEND_FEEDBACK_LABEL}</Text>
        <Text style={styles.cardValue}>Tell us what was confusing or broken</Text>
      </View>
      <ChevronRight size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 44,
  },
  cardIconWrap: { marginRight: spacing.base, width: 28, alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  cardValue: { ...typography.caption, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 52,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabelGroup: { flex: 1, marginRight: spacing.md },
  rowLabel: { ...typography.body, color: colors.text },
  rowHint: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  rowArrow: { fontSize: 22, color: colors.textTertiary },
});
