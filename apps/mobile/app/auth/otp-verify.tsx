import React, { useState, useEffect, useCallback } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet } from 'react-native';
import { showToast } from '@/lib/toast';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth.store';
import { getErrorMessage } from '@/utils/errors';
import { Button, OTPInput, Card } from '@/components/ui';
import { formatPHPhone } from '@/utils/phone';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { useCaptchaOtp } from '@/hooks/useCaptchaOtp';
import { getConfig } from '@/services/config.service';
import AuthBrandPanel from '@/components/AuthBrandPanel';

import { Routes } from '@/config/navigation';
export default function OTPVerifyScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { requestOtpWithCaptcha, captchaModal } = useCaptchaOtp();
  const runtimeConfig = getConfig();
  const otpLength = runtimeConfig.otpLength;
  const otpCooldownSeconds = runtimeConfig.otpCooldownSeconds;
  const params = useLocalSearchParams<{
    phone: string;
    mode: 'login' | 'register';
    firstName?: string;
    lastName?: string;
  }>();

  const { verifyOtp, register } = useAuthStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState<number>(otpCooldownSeconds);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerify = useCallback(async (otp: string) => {
    if (otp.length !== otpLength) return;

    setLoading(true);
    setError(false);
    try {
      if (params.mode === 'register' && params.firstName && params.lastName) {
        await verifyOtp(params.phone, otp);
        await register(params.phone, params.firstName, params.lastName);
        router.replace(Routes.PROVIDER_ONBOARDING.ROLE_SELECT);
      } else {
        await verifyOtp(params.phone, otp);
        const { user } = useAuthStore.getState();
        if (user?.role === 'provider') {
          router.replace(Routes.PROVIDER_TABS.DASHBOARD);
        } else {
          router.replace(Routes.TABS.HOME);
        }
      }
    } catch (err: unknown) {
      setError(true);
      // Phase D CRIT-69 / K-MED-K04 fix — canonical error helper.
      // A7 — toast + the OTP input's red error state instead of a modal.
      const msg = getErrorMessage(err, 'Invalid code. Please try again.');
      showToast(msg, 'error');
      setError(true);
      setCode('');
    } finally {
      setLoading(false);
    }
  }, [otpLength, params, verifyOtp, register, router]);

  const handleCodeChange = (val: string): void => {
    setCode(val);
    setError(false);
    if (val.length === otpLength) {
      handleVerify(val);
    }
  };

  const handleResend = async (): Promise<void> => {
    if (resendCooldown > 0) return;
    try {
      await requestOtpWithCaptcha(params.phone);
      setResendCooldown(otpCooldownSeconds);
      setCode('');
      setError(false);
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to resend code. Please try again.'), 'error');
    }
  };

  return (
    <View style={[
      styles.container,
      isPhone ? { paddingTop: insets.top + spacing.xxl } : styles.containerWide,
    ]}>
      <View
        style={[styles.workspace, !isPhone && styles.workspaceWide]}
        accessibilityLabel={!isPhone ? 'Desktop verification workspace' : undefined}
      >
        {!isPhone ? (
          <AuthBrandPanel
            eyebrow="SECURE VERIFICATION"
            title="Confirm the number tied to your records."
            description="The verification step protects access to bookings, provider work evidence, payment state, and support conversations."
          />
        ) : null}
        <View style={[styles.formColumn, !isPhone && styles.formColumnWide]}>
        <View style={styles.header}>
          <Text style={styles.title}>Enter Verification Code</Text>
          <Text style={styles.subtitle}>
            We sent a verification code with {otpLength} digits to{'\n'}
            <Text style={styles.phone}>{formatPHPhone(params.phone)}</Text>
          </Text>
        </View>

        <Card style={styles.card}>
          <View style={styles.otpContainer}>
            <OTPInput
              value={code}
              onChange={handleCodeChange}
              error={error}
              length={otpLength}
            />
          </View>

          <Button
            title="Verify"
            onPress={() => handleVerify(code)}
            loading={loading}
            disabled={code.length !== otpLength}
            style={styles.verifyButton}
          />

          <View style={styles.resendContainer}>
            {resendCooldown > 0 ? (
              <Text style={styles.resendText}>Resend in {resendCooldown}s</Text>
            ) : (
              <Button
                title="Resend Code"
                onPress={handleResend}
                variant="ghost"
              />
            )}
          </View>
        </Card>
        </View>
      </View>
      {captchaModal}
    </View>
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
  card: { borderRadius: borderRadius.lg },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  phone: { fontWeight: '600', color: colors.text },
  otpContainer: { marginBottom: spacing.xl },
  verifyButton: { marginBottom: spacing.base },
  resendContainer: { alignItems: 'center' },
  resendText: { ...typography.body, color: colors.textTertiary },
});
