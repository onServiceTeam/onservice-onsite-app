import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Input } from '@/components/ui';
import { validatePHPhone, normalizePHPhone } from '@/utils/phone';
import { colors, spacing, typography } from '@/config/theme';

export default function LoginScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { requestOtp } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async (): Promise<void> => {
    setError('');
    if (!validatePHPhone(phone)) {
      setError('Enter a valid Philippine mobile number (+63 9XX XXX XXXX)');
      return;
    }

    setLoading(true);
    try {
      const normalized = normalizePHPhone(phone);
      await requestOtp(normalized);
      router.push({ pathname: '/auth/otp-verify', params: { phone: normalized, mode: 'login' } });
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = axErr?.response?.data?.error?.message;
      Alert.alert('Error', msg ?? 'Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          Enter your mobile number to log in
        </Text>
      </View>

      <View style={styles.form}>
        <Input
          label="Mobile Number"
          placeholder="+63 9XX XXX XXXX"
          value={phone}
          onChangeText={(text) => {
            setPhone(text);
            setError('');
          }}
          keyboardType="phone-pad"
          autoFocus
          error={error}
        />

        <Button
          title="Send Verification Code"
          onPress={handleSendOtp}
          loading={loading}
          disabled={phone.length < 10}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <Link href="/auth/register" style={styles.link}>
          Create Account
        </Link>
      </View>

      <Text style={styles.legal}>
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  header: { marginBottom: spacing.xl },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary },
  form: { gap: spacing.base },
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
});
