import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';
import { useEmailSignInFlow } from '@/stores/email-signin.store';
import { useCaptchaEmailCode } from '@/hooks/useCaptchaEmailCode';
import { ApiError } from '@/services/api';
import { getErrorMessage } from '@/utils/errors';
import { Button, OTPInput, Card } from '@/components/ui';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive } from '@/hooks/useResponsive';
import AuthBrandPanel from '@/components/AuthBrandPanel';
import { Routes } from '@/config/navigation';

/**
 * D37 (Ken, 2026-10-11): enter the 6-digit code from the email.
 *
 * - The countdown runs from the server's own remaining time, not the phone's
 *   clock. The server alone decides; this screen never accepts a code the
 *   server would refuse, and never refuses one the server would accept.
 * - "Resend code" unlocks 30 seconds after each send and re-sends the SAME
 *   code with the SAME expiry. After the 5 minutes, "Send a new code"
 *   requests a fresh code with a fresh 5 minutes.
 */

const CODE_LENGTH = 6;
// Server answers that mean this code can no longer be used at all.
const DEAD_CODE = new Set(['email_code_expired', 'email_code_not_found', 'email_code_attempts_exhausted']);

/** 4:59, 0:07 ... rounded up, so 0:00 shows only when the time is truly gone. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function errorCode(err: unknown): string | undefined {
  return err instanceof ApiError ? (err.body?.error as { code?: string } | undefined)?.code : undefined;
}

export default function EmailVerifyScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { verifyEmailCode } = useAuthStore();
  const { requestEmailCodeWithCaptcha, captchaModal } = useCaptchaEmailCode();
  const flow = useEmailSignInFlow();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  // Re-render twice a second; the time itself is read fresh on every render,
  // so a resend or a server 'expired' answer shows correctly at once.
  const [, setTick] = useState(0);

  // Set just before this screen leaves on purpose. expo-router queues
  // navigations, so without it clearing the flow would also queue the
  // "start over" redirect below, and that later one would win.
  const leaving = useRef(false);

  // Nothing in memory (for example the web page was reloaded): start over.
  useEffect(() => {
    if (!flow.email && !leaving.current) router.replace(Routes.AUTH.LOGIN);
  }, [flow.email, router]);

  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), 500);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();
  const expired = flow.expiresAt <= now;
  const resendWait = Math.max(0, flow.resendAt - now);

  const handleVerify = useCallback(async (value: string) => {
    const email = useEmailSignInFlow.getState().email;
    if (value.length !== CODE_LENGTH || verifying || !email) return;
    if (Date.now() >= useEmailSignInFlow.getState().expiresAt) {
      setError('This code has expired. Send a new code.');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const outcome = await verifyEmailCode(email, value);
      if (outcome.status === 'needs_account') {
        useEmailSignInFlow.getState().needsAccount(outcome.signupToken, outcome.signupExpiresInSeconds);
        router.replace(Routes.AUTH.CREATE_ACCOUNT);
        return;
      }
      const role = useAuthStore.getState().user?.role;
      leaving.current = true;
      if (outcome.isNewUser) router.replace(Routes.PROVIDER_ONBOARDING.ROLE_SELECT);
      else if (role === 'provider') router.replace(Routes.PROVIDER_TABS.DASHBOARD);
      else if (role === 'provider_staff') router.replace(Routes.STAFF.JOBS);
      else router.replace(Routes.TABS.HOME);
      useEmailSignInFlow.getState().clear();
    } catch (err: unknown) {
      if (DEAD_CODE.has(errorCode(err) ?? '')) {
        useEmailSignInFlow.getState().update({ expiresInMs: 0, resendInMs: 0 });
      }
      setError(getErrorMessage(err, 'That code did not work. Please try again.'));
      setCode('');
    } finally {
      setVerifying(false);
    }
  }, [verifying, verifyEmailCode, router]);

  const handleCodeChange = (value: string): void => {
    setCode(value);
    setError('');
    if (value.length === CODE_LENGTH) void handleVerify(value);
  };

  const handleResend = async (): Promise<void> => {
    const state = useEmailSignInFlow.getState();
    if (!state.email || sending) return;
    // Honour the server's wait, after expiry too (hourly or network limits).
    if (state.resendAt > Date.now()) return;
    setSending(true);
    setError('');
    try {
      const receipt = await requestEmailCodeWithCaptcha(state.email);
      useEmailSignInFlow.getState().update(receipt);
      setCode('');
      showToast(receipt.resent
        ? 'We sent the same code again. Check your inbox and spam folder.'
        : 'We sent you a new code. It works for 5 minutes.', 'success');
    } catch (err: unknown) {
      const retryAfterMs = err instanceof ApiError
        ? Number((err.body?.error as { retryAfterMs?: unknown } | undefined)?.retryAfterMs) : NaN;
      if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
        useEmailSignInFlow.setState({ resendAt: Date.now() + retryAfterMs });
      }
      setError(getErrorMessage(err, "We couldn't send the code. Please try again."));
    } finally {
      setSending(false);
    }
  };

  const changeEmail = (): void => {
    const mode = useEmailSignInFlow.getState().mode;
    leaving.current = true;
    router.replace(mode === 'register' ? Routes.AUTH.REGISTER : Routes.AUTH.LOGIN);
    useEmailSignInFlow.getState().clear();
  };

  return (
    <View style={[styles.container, isPhone ? { paddingTop: insets.top + spacing.xxl } : styles.containerWide]}>
      <View
        style={[styles.workspace, !isPhone && styles.workspaceWide]}
        accessibilityLabel={!isPhone ? 'Desktop email verification workspace' : undefined}
      >
        {!isPhone ? (
          <AuthBrandPanel
            eyebrow="SECURE VERIFICATION"
            title="Confirm the email tied to your account."
            description="The code protects access to bookings, provider work, payment state and support conversations."
          />
        ) : null}
        <View style={[styles.formColumn, !isPhone && styles.formColumnWide]}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.email}>{flow.email ?? ''}</Text>
            </Text>
          </View>

          <Card style={styles.card}>
            <Text
              style={[styles.clock, expired && styles.clockExpired]}
              testID="email-code-clock"
              accessibilityLiveRegion="none"
            >
              {expired ? 'This code has expired.' : `Code expires in ${formatClock(flow.expiresAt - now)}`}
            </Text>

            {flow.alreadySent ? (
              <Text style={styles.notice} accessibilityRole="alert" testID="email-code-already-sent">
                We already sent a code to this email a moment ago. Enter it below.
              </Text>
            ) : null}
            {flow.deliveryUncertain ? (
              <Text style={styles.notice} accessibilityRole="alert" testID="email-code-uncertain">
                We couldn't confirm the email went out. If it doesn't arrive within a minute, tap Resend.
              </Text>
            ) : null}

            <View style={styles.otpContainer}>
              <OTPInput value={code} onChange={handleCodeChange} error={error.length > 0} length={CODE_LENGTH} />
            </View>

            {error.length > 0 && (
              <Text style={styles.error} accessibilityRole="alert" testID="email-code-error">{error}</Text>
            )}

            <Button
              title="Verify"
              onPress={() => { void handleVerify(code); }}
              loading={verifying}
              disabled={code.length !== CODE_LENGTH || expired}
              style={styles.verifyButton}
            />

            <View style={styles.resendContainer}>
              {expired && resendWait > 0 ? (
                <Text style={styles.resendText} testID="email-code-new-wait">
                  Send a new code in {formatClock(resendWait)}
                </Text>
              ) : expired ? (
                <Button
                  title="Send a new code"
                  onPress={() => { void handleResend(); }}
                  loading={sending}
                  variant="secondary"
                />
              ) : resendWait > 0 ? (
                <Text style={styles.resendText} testID="email-code-resend-wait">
                  Resend code in {formatClock(resendWait)}
                </Text>
              ) : (
                <Button
                  title="Resend code"
                  onPress={() => { void handleResend(); }}
                  loading={sending}
                  variant="ghost"
                />
              )}
            </View>

            <Text style={styles.tip}>
              Can't find it? Check your spam or junk folder. Codes come from onService PH.
            </Text>
          </Card>

          <Pressable onPress={changeEmail} accessibilityRole="link" style={styles.changeEmail} testID="email-code-change">
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </View>
      </View>
      {captchaModal}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.lg, alignItems: 'center' },
  containerWide: { paddingTop: spacing.xl, paddingBottom: spacing.xl, justifyContent: 'center' },
  workspace: { width: '100%' },
  workspaceWide: {
    maxWidth: 1120, minHeight: 720, maxHeight: 820, flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: borderRadius.xl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  formColumn: { width: '100%' },
  formColumnWide: { width: 'auto', flex: 1, justifyContent: 'center', paddingHorizontal: 64, paddingVertical: spacing.xl },
  card: { borderRadius: borderRadius.lg },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  email: { fontWeight: '600', color: colors.text },
  clock: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.base },
  clockExpired: { color: colors.error, fontWeight: '600' },
  otpContainer: { marginBottom: spacing.base },
  notice: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.base },
  error: { ...typography.bodySmall, color: colors.error, textAlign: 'center', marginBottom: spacing.base },
  verifyButton: { marginBottom: spacing.base },
  resendContainer: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  resendText: { ...typography.body, color: colors.textTertiary },
  tip: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.base },
  changeEmail: { alignItems: 'center', marginTop: spacing.xl, minHeight: 44, justifyContent: 'center' },
  link: { ...typography.body, color: colors.primary, fontWeight: '600' },
});
