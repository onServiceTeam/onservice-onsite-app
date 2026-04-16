import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Input } from '@/components/ui';
import { validatePHPhone, normalizePHPhone } from '@/utils/phone';
import { colors, spacing, typography } from '@/config/theme';

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
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = axErr?.response?.data?.error?.message;
      Alert.alert('Error', msg ?? 'Failed to send verification code. Please try again.');
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
          <Input
            label="Mobile Number"
            placeholder="+63 9XX XXX XXXX"
            value={phone}
            onChangeText={(t) => { setPhone(t); setErrors((e) => ({ ...e, phone: undefined })); }}
            keyboardType="phone-pad"
            error={errors.phone}
          />

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

        <Text style={styles.legal}>
          By creating an account, you agree to our Terms of Service and Privacy Policy.
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
});
