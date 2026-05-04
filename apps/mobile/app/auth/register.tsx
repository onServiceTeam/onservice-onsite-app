import React, { useState } from 'react';
// Phase 14 remediation — audited (D14r-9 markers pass)
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth.store';
import { getErrorMessage } from '@/utils/errors';
import { Button, Input } from '@/components/ui';
import { validatePHPhone, normalizePHPhone } from '@/utils/phone';
import { colors, spacing, typography } from '@/config/theme';
// Phase 14 R5-complete — PhoneInput component for register form.
import PhoneInput from '@/components/PhoneInput';

export default function RegisterScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { requestOtp } = useAuthStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (firstName.trim().length < 2) newErrors.firstName = 'First name must be at least 2 characters';
    if (lastName.trim().length < 2) newErrors.lastName = 'Last name must be at least 2 characters';
    if (!validatePHPhone(phone)) newErrors.phone = 'Enter a valid Philippine mobile number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!validate()) return;

    setLoading(true);
    try {
      const normalized = normalizePHPhone(phone);
      await requestOtp(normalized);
      router.push({
        pathname: '/auth/otp-verify',
        params: {
          phone: normalized,
          mode: 'register',
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        },
      });
    } catch (err: unknown) {
      // Phase D CRIT-69 / K-MED-K04 fix — canonical error helper.
      const msg = getErrorMessage(err, 'Failed to send verification code. Please try again.');
      Alert.alert('Error', msg);
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Join onService to book trusted home service professionals
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="First Name"
            placeholder="Juan"
            value={firstName}
            onChangeText={(t) => { setFirstName(t); setErrors((e) => ({ ...e, firstName: undefined })); }}
            autoCapitalize="words"
            error={errors.firstName}
          />
          <Input
            label="Last Name"
            placeholder="Dela Cruz"
            value={lastName}
            onChangeText={(t) => { setLastName(t); setErrors((e) => ({ ...e, lastName: undefined })); }}
            autoCapitalize="words"
            error={errors.lastName}
          />
          {/* Phase 14 R5-complete — PhoneInput component */}
          <PhoneInput
            value={phone}
            onChange={(t) => {
              setPhone(t);
              setErrors((e) => ({ ...e, phone: undefined }));
            }}
            label="Mobile Number"
            errorVisible={!!errors.phone}
            testID="register-phone-input"
          />
          {errors.phone && (
            <Text style={{ color: colors.error, ...typography.bodySmall }}>{errors.phone}</Text>
          )}

          <Button
            title="Continue"
            onPress={handleSubmit}
            loading={loading}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/auth/login" style={styles.link}>
            Log In
          </Link>
        </View>

        {/* BUG-PHASE63-01 fix — pre-fix this was a plain-text Text so
            the user "agreed" to Terms/Privacy without any way to read
            them. Now the two legal docs are tappable links pushing to
            /customer/terms with the right tab pre-selected. */}
        <Text style={styles.legal}>
          By creating an account, you agree to our{' '}
          <Text
            style={styles.legalLink}
            onPress={() => router.push({ pathname: '/customer/terms', params: { tab: 'terms' } })}
            testID="register-terms-link"
          >
            Terms of Service
          </Text>
          {' '}and{' '}
          <Text
            style={styles.legalLink}
            onPress={() => router.push({ pathname: '/customer/terms', params: { tab: 'privacy' } })}
            testID="register-privacy-link"
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.xl },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary },
  form: { gap: spacing.xs },
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
