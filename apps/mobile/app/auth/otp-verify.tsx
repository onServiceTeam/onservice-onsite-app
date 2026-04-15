import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth.store';
import { Button, OTPInput } from '@/components/ui';
import { formatPHPhone } from '@/utils/phone';
import { platformConfig } from '@/config/platform.config';
import { colors, spacing, typography } from '@/config/theme';

export default function OTPVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    phone: string;
    mode: 'login' | 'register';
    firstName?: string;
    lastName?: string;
  }>();

  const { verifyOtp, register, requestOtp } = useAuthStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [resendCooldown, setResendCooldown] = useState<number>(platformConfig.otpCooldownSeconds);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerify = useCallback(async (otp: string) => {
    if (otp.length !== platformConfig.otpLength) return;

    setLoading(true);
    setError(false);
    try {
      if (params.mode === 'register' && params.firstName && params.lastName) {
        await verifyOtp(params.phone, otp);
        await register(params.phone, params.firstName, params.lastName);
      } else {
        await verifyOtp(params.phone, otp);
      }
      router.replace('/(tabs)/home');
    } catch (err: unknown) {
      setError(true);
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = axErr?.response?.data?.error?.message;
      Alert.alert('Verification Failed', msg ?? 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  }, [params, verifyOtp, register, router]);

  const handleCodeChange = (val: string) => {
    setCode(val);
    setError(false);
    if (val.length === platformConfig.otpLength) {
      handleVerify(val);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await requestOtp(params.phone);
      setResendCooldown(platformConfig.otpCooldownSeconds);
      setCode('');
      setError(false);
    } catch {
      Alert.alert('Error', 'Failed to resend code. Please try again.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Enter Verification Code</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.phone}>{formatPHPhone(params.phone)}</Text>
        </Text>
      </View>

      <View style={styles.otpContainer}>
        <OTPInput
          value={code}
          onChange={handleCodeChange}
          error={error}
          length={platformConfig.otpLength}
        />
      </View>

      <Button
        title="Verify"
        onPress={() => handleVerify(code)}
        loading={loading}
        disabled={code.length !== platformConfig.otpLength}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  phone: { fontWeight: '600', color: colors.text },
  otpContainer: { marginBottom: spacing.xl },
  verifyButton: { marginBottom: spacing.base },
  resendContainer: { alignItems: 'center' },
  resendText: { ...typography.body, color: colors.textTertiary },
});
