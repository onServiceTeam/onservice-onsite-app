import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getErrorMessage } from '@/utils/errors';
import { Button, Input, Card } from '@/components/ui';
import { validatePHPhone, normalizePHPhone } from '@/utils/phone';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
// Phase 14 R5-complete — PhoneInput component for register form.
import PhoneInput from '@/components/PhoneInput';
import { useCaptchaOtp } from '@/hooks/useCaptchaOtp';
import { useResponsive } from '@/hooks/useResponsive';
import AuthBrandPanel from '@/components/AuthBrandPanel';
import { Routes } from '@/config/navigation';
import { useAuthMethods } from '@/hooks/useAuthMethods';
import EmailSignInForm from '@/components/auth/EmailSignInForm';
import { usePhoneSignInFlow } from '@/stores/phone-signin.store';

export default function RegisterScreen(): React.ReactElement {
  const router = useRouter();
  const startPhoneFlow = usePhoneSignInFlow(state => state.start);
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { requestOtpWithCaptcha, captchaModal } = useCaptchaOtp();
  // D37 (Ken, 2026-10-11): with phone codes paused, a new account starts with
  // an email code; name and mobile number follow on /auth/create-account.
  // The phone form below is kept intact for when phone codes return.
  const methods = useAuthMethods();
  // While the server's answer loads, show neither form. When both methods are
  // on, email comes first and a link switches to the phone form.
  const [preferPhone, setPreferPhone] = useState(false);
  const methodsLoading = methods.status === 'loading';
  const canSwitch = methods.email && methods.phone;
  const showEmail = !methodsLoading && methods.email && !(preferPhone && methods.phone);
  const showPhone = !methodsLoading && methods.phone && (!methods.email || preferPhone);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});
  // The server's reason the code could not be sent, shown on this screen.
  const [sendError, setSendError] = useState('');

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (firstName.trim().length < 2) newErrors.firstName = 'First name must be at least 2 characters';
    if (lastName.trim().length < 2) newErrors.lastName = 'Last name must be at least 2 characters';
    if (!validatePHPhone(phone)) newErrors.phone = 'Enter a valid Philippine mobile number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (): Promise<void> => {
    setSendError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const normalized = normalizePHPhone(phone);
      await requestOtpWithCaptcha(normalized);
      // The number and name travel in memory, not in the route, so they never
      // land in the browser's address bar or history (same as the email flow).
      startPhoneFlow(normalized, 'register', { firstName: firstName.trim(), lastName: lastName.trim() });
      router.push(Routes.AUTH.OTP_VERIFY);
    } catch (err: unknown) {
      // Phase D CRIT-69 / K-MED-K04 fix — canonical error helper.
      // The server's reason (for example a text that could not be sent, or
      // onService being open to invited testers only) stays on this screen.
      const msg = getErrorMessage(err, 'Failed to send verification code. Please try again.');
      setSendError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          !isPhone && styles.contentWide,
          { paddingTop: insets.top + spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        accessibilityLabel={!isPhone ? 'Desktop registration workspace' : undefined}
      >
        {!isPhone ? (
          <AuthBrandPanel
            eyebrow="CREATE YOUR ACCOUNT"
            title="Start with a clear service record."
            description="One account can book providers, manage project planning, follow work evidence, and keep every support handoff connected."
          />
        ) : null}
        <View style={[styles.formColumn, !isPhone && styles.formColumnWide]}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Join onService to book trusted home service professionals
          </Text>
        </View>

        {/* BUG-PHASE147-01 fix — pre-fix First/Last Name inputs had
            no maxLength. Server's auth.validators.ts:76-77 caps both
            at max(100). Same fix shape as Phase 145/146. */}
        <Card style={styles.form}>
          {methods.status === 'unavailable' && <Text style={{ color: colors.textSecondary, ...typography.bodySmall }} accessibilityRole="alert">
            We couldn't reach onService to check sign-in options. Check your connection.{' '}
            <Text style={styles.legalLink} onPress={methods.retry} accessibilityRole="button">Try again</Text>
          </Text>}
          {showEmail && <EmailSignInForm mode="register" />}
          {!showEmail && !showPhone && methods.status === 'ready' && <Text style={{ color: colors.textSecondary, ...typography.bodySmall }} accessibilityRole="alert">
            Creating accounts is temporarily unavailable. Please try again later.
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

          {showPhone && <>
          <Input
            label="First Name"
            placeholder="Juan"
            value={firstName}
            onChangeText={(t) => { setFirstName(t); setErrors((e) => ({ ...e, firstName: undefined })); }}
            autoCapitalize="words"
            maxLength={100}
            error={errors.firstName}
          />
          <Input
            label="Last Name"
            placeholder="Dela Cruz"
            value={lastName}
            onChangeText={(t) => { setLastName(t); setErrors((e) => ({ ...e, lastName: undefined })); }}
            autoCapitalize="words"
            maxLength={100}
            error={errors.lastName}
          />
          {/* Phase 14 R5-complete — PhoneInput component */}
          <PhoneInput
            value={phone}
            onChange={(t) => {
              setPhone(t);
              setErrors((e) => ({ ...e, phone: undefined }));
              setSendError('');
            }}
            label="Mobile Number"
            errorVisible={!!errors.phone || sendError.length > 0}
            testID="register-phone-input"
          />
          {errors.phone && (
            <Text style={{ color: colors.error, ...typography.bodySmall }}>{errors.phone}</Text>
          )}
          {sendError.length > 0 && (
            <Text
              style={{ color: colors.error, ...typography.bodySmall }}
              accessibilityRole="alert"
              testID="register-phone-error"
            >
              {sendError}
            </Text>
          )}

          <Button
            title="Continue"
            onPress={handleSubmit}
            loading={loading}
          />
          </>}
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/auth/login" style={styles.link}>
            Log In
          </Link>
        </View>

        {/* Read policies before creating an account. This public route does
            not expose the protected customer account stack. */}
        <Text style={styles.legal}>
          By creating an account, you agree to our{' '}
          <Link
            style={styles.legalLink}
            href={{ pathname: Routes.LEGAL, params: { tab: 'terms' } }}
            testID="register-terms-link"
          >
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link
            style={styles.legalLink}
            href={{ pathname: Routes.LEGAL, params: { tab: 'privacy' } }}
            testID="register-privacy-link"
          >
            Privacy Policy
          </Link>
          .
        </Text>
        </View>
      </ScrollView>
      {captchaModal}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  contentWide: {
    width: '100%',
    maxWidth: 1120,
    minHeight: 780,
    alignSelf: 'center',
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingBottom: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  formColumn: { width: '100%' },
  formColumnWide: { width: 'auto', flex: 1, justifyContent: 'center', paddingHorizontal: 64, paddingVertical: spacing.xl },
  header: { marginBottom: spacing.xl },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary },
  form: { gap: spacing.xs, borderRadius: borderRadius.lg },
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
