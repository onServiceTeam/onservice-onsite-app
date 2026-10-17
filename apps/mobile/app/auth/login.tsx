import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card } from '@/components/ui';
import { validatePHPhone, normalizePHPhone } from '@/utils/phone';
import { getErrorMessage } from '@/utils/errors';
import { useCaptchaOtp } from '@/hooks/useCaptchaOtp';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
// Phase 14 R5-complete — PhoneInput cross-cutting component wired
// into the login flow. Replaces the inline <Input> phone field with
// the PhoneInput component (which renders the +63 country code chip
// + the formatted input + the validation error inline).
import PhoneInput from '@/components/PhoneInput';
import { Routes } from '@/config/navigation';
import { DEMO_MODE, demoLogin, type DemoRole } from '@/config/demo';
import { useResponsive } from '@/hooks/useResponsive';
import AuthBrandPanel from '@/components/AuthBrandPanel';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthMethods } from '@/hooks/useAuthMethods';
import EmailSignInForm from '@/components/auth/EmailSignInForm';
import { usePhoneSignInFlow } from '@/stores/phone-signin.store';

export default function LoginScreen(): React.ReactElement {
  const router = useRouter();
  const startPhoneFlow = usePhoneSignInFlow(state => state.start);
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const sessionExpired = useAuthStore(state => state.sessionExpired);
  // D37 (Ken, 2026-10-11): phone codes are paused while SMS cannot be
  // delivered; the server says which method is on. The phone form below is
  // kept intact and returns when the server switches phone codes back on.
  const methods = useAuthMethods();
  // While the server's answer loads, show neither form. When both methods are
  // on, email comes first and a link switches to the phone form.
  const [preferPhone, setPreferPhone] = useState(false);
  const methodsLoading = methods.status === 'loading';
  const canSwitch = methods.email && methods.phone;
  const showEmail = !methodsLoading && methods.email && !(preferPhone && methods.phone);
  const showPhone = !methodsLoading && methods.phone && (!methods.email || preferPhone);
  // requestOtpWithCaptcha transparently handles the server's 428 captcha
  // challenge (Cloudflare Turnstile) that appears after the lockout threshold.
  const { requestOtpWithCaptcha, captchaModal } = useCaptchaOtp();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Demo mode (staging UX testing) — one-tap entry as a seeded account.
  const [demoLoading, setDemoLoading] = useState<DemoRole | null>(null);

  const handleDemo = async (role: DemoRole): Promise<void> => {
    setError('');
    setDemoLoading(role);
    try {
      await demoLogin(role);
      router.replace(role === 'provider' ? Routes.PROVIDER_TABS.DASHBOARD : Routes.TABS.HOME);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not enter demo. Please try again.'));
    } finally {
      setDemoLoading(null);
    }
  };

  const handleSendOtp = async (): Promise<void> => {
    setError('');
    if (!validatePHPhone(phone)) {
      setError('Enter a valid Philippine mobile number (+63 9XX XXX XXXX)');
      return;
    }

    setLoading(true);
    try {
      const normalized = normalizePHPhone(phone);
      await requestOtpWithCaptcha(normalized);
      // The number travels in memory, not in the route, so it never lands in
      // the browser's address bar or history (same as the email flow).
      startPhoneFlow(normalized, 'login');
      router.push(Routes.AUTH.OTP_VERIFY);
    } catch (err: unknown) {
      // Phase D CRIT-69 fix — use canonical getErrorMessage helper
      // so server-side messages (e.g. "Too many attempts. Please
      // wait 60 seconds.") actually display instead of being
      // swallowed by the legacy axios-shape parser that returned
      // undefined for ApiError instances.
      // A7 — surface server errors inline (same affordance as the
      // validation error above) instead of a modal alert.
      const msg = getErrorMessage(err, 'Failed to send verification code. Please try again.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        isPhone ? { paddingTop: insets.top + spacing.xxl } : styles.containerWide,
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[styles.workspace, !isPhone && styles.workspaceWide]}
        accessibilityLabel={!isPhone ? 'Desktop login workspace' : undefined}
      >
        {!isPhone ? (
          <AuthBrandPanel
            eyebrow="YOUR SERVICE ACCOUNT"
            title="Return to every service record."
            description="Log in to manage bookings, compare provider work, review payment state, and keep support context in one place."
          />
        ) : null}
        <View style={[styles.formColumn, !isPhone && styles.formColumnWide]}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            {showPhone ? 'Enter your mobile number to log in' : 'Enter your email address to log in'}
          </Text>
        </View>

        <Card style={styles.form}>
          {sessionExpired && <Text style={styles.sessionNotice} accessibilityRole="alert">
            {showEmail
              ? 'Sign in again to confirm your current account access. Use the email address on your account. If you were applying to become a provider, signing in does not submit another application.'
              : 'Sign in again to confirm your current account access. Use your verified mobile number. If you were applying to become a provider, signing in does not submit another application.'}
          </Text>}
          {methods.status === 'unavailable' && <Text style={styles.sessionNotice} accessibilityRole="alert">
            We couldn't reach onService to check sign-in options. Check your connection.{' '}
            <Text style={styles.legalLink} onPress={methods.retry} accessibilityRole="button">Try again</Text>
          </Text>}
          {showEmail && <EmailSignInForm mode="login" />}
          {!showEmail && !showPhone && methods.status === 'ready' && <Text style={styles.sessionNotice} accessibilityRole="alert">
            Sign-in is temporarily unavailable. Please try again later.
          </Text>}
          {methodsLoading && <ActivityIndicator accessibilityLabel="Checking sign-in options" />}
          {canSwitch && !methodsLoading && (
            <Pressable
              onPress={() => setPreferPhone(value => !value)}
              accessibilityRole="button"
              style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={styles.legalLink}>
                {showPhone ? 'Use my email instead' : 'Use my mobile number instead'}
              </Text>
            </Pressable>
          )}

          {/* Phase 14 R5-complete — PhoneInput component. D37: shown only while phone codes are on. */}
          {showPhone && <>
          <PhoneInput
            value={phone}
            onChange={(text) => {
              setPhone(text);
              setError('');
            }}
            label="Mobile Number"
            errorVisible={error.length > 0}
            testID="login-phone-input"
          />
          {/* The server's own reason (for example a text that could not be
              sent, or onService being open to invited testers only) shows
              here, on the number screen, instead of opening the code screen. */}
          {error.length > 0 && (
            <Text
              style={{ color: colors.error, ...typography.bodySmall, marginTop: spacing.xs }}
              accessibilityRole="alert"
              testID="login-phone-error"
            >
              {error}
            </Text>
          )}

          <Button
            title="Send Verification Code"
            onPress={handleSendOtp}
            loading={loading}
            disabled={phone.length < 10}
          />
          </>}

          {/* Demo entry signs in with phone codes, so it shows only while they are on. */}
          {DEMO_MODE && showPhone && (
            <View style={styles.demo}>
              <Text style={styles.demoLabel}>Or jump straight in (demo)</Text>
              <Button
                title="Enter as Customer"
                variant="secondary"
                onPress={() => handleDemo('customer')}
                loading={demoLoading === 'customer'}
                disabled={demoLoading !== null}
              />
              <Button
                title="Enter as Provider"
                variant="outline"
                onPress={() => handleDemo('provider')}
                loading={demoLoading === 'provider'}
                disabled={demoLoading !== null}
              />
            </View>
          )}
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/auth/register" style={styles.link}>
            Create Account
          </Link>
        </View>

        {/* Public, keyboard-accessible links. The customer document route is
            protected and redirects signed-out readers back to this screen. */}
        <Text style={styles.legal}>
          By continuing, you agree to our{' '}
          <Link
            style={styles.legalLink}
            href={{ pathname: Routes.LEGAL, params: { tab: 'terms' } }}
            testID="login-terms-link"
          >
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link
            style={styles.legalLink}
            href={{ pathname: Routes.LEGAL, params: { tab: 'privacy' } }}
            testID="login-privacy-link"
          >
            Privacy Policy
          </Link>
          .
        </Text>
        </View>
      </View>

      {captchaModal}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  containerWide: { paddingTop: spacing.xl, paddingBottom: spacing.xl, justifyContent: 'center' },
  workspace: { width: '100%' },
  workspaceWide: {
    maxWidth: 1120,
    minHeight: 720,
    maxHeight: 820,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  formColumn: { width: '100%' },
  formColumnWide: { width: 'auto', flex: 1, justifyContent: 'center', paddingHorizontal: 64, paddingVertical: spacing.xl },
  header: { marginBottom: spacing.xl },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary },
  form: { gap: spacing.base, borderRadius: borderRadius.lg },
  sessionNotice: { ...typography.bodySmall, color: colors.textSecondary },
  demo: {
    gap: spacing.sm,
    marginTop: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  demoLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: { ...typography.body, color: colors.textSecondary },
  link: { ...typography.body, color: colors.primary, fontWeight: '600' },
  legal: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.base,
  },
  legalLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
