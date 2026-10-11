import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth.store';
import { useEmailSignInFlow } from '@/stores/email-signin.store';
import { getErrorMessage } from '@/utils/errors';
import { validatePHPhone, normalizePHPhone } from '@/utils/phone';
import { Button, Input, Card } from '@/components/ui';
import PhoneInput from '@/components/PhoneInput';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { useResponsive } from '@/hooks/useResponsive';
import AuthBrandPanel from '@/components/AuthBrandPanel';
import { Routes } from '@/config/navigation';

/**
 * D37 (Ken, 2026-10-11): a new email has been proven with its code; the
 * account is created only now, with a name and a mobile number. The number
 * is contact information: it is not verified by SMS while SMS is paused, and
 * the server will not let phone sign-in open this account until it is.
 */
export default function CreateAccountScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { completeEmailSignup } = useAuthStore();
  const email = useEmailSignInFlow(state => state.email);
  const signupToken = useEmailSignInFlow(state => state.signupToken);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  // Set just before leaving on purpose, so clearing the flow does not also
  // queue the "start over" redirect (expo-router runs queued navigations in order).
  const leaving = useRef(false);

  // Without a proven email in memory (e.g. a reloaded web page) start over.
  useEffect(() => {
    if ((!email || !signupToken) && !leaving.current) router.replace(Routes.AUTH.REGISTER);
  }, [email, signupToken, router]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (firstName.trim().length < 1) next.firstName = 'Enter your first name';
    if (lastName.trim().length < 1) next.lastName = 'Enter your last name';
    if (!validatePHPhone(phone)) next.phone = 'Enter a valid Philippine mobile number (+63 9XX XXX XXXX)';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleCreate = async (): Promise<void> => {
    const state = useEmailSignInFlow.getState();
    if (!state.signupToken || !validate()) return;
    if (Date.now() >= state.signupExpiresAt) {
      setErrors({ form: 'This step timed out. Please ask for a new code to continue.' });
      return;
    }
    setLoading(true);
    try {
      await completeEmailSignup({
        signupToken: state.signupToken,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: normalizePHPhone(phone),
      });
      leaving.current = true;
      router.replace(Routes.PROVIDER_ONBOARDING.ROLE_SELECT);
      useEmailSignInFlow.getState().clear();
    } catch (err: unknown) {
      setErrors({ form: getErrorMessage(err, "We couldn't create your account. Please try again.") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, !isPhone && styles.contentWide, { paddingTop: insets.top + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        accessibilityLabel={!isPhone ? 'Desktop create account workspace' : undefined}
      >
        {!isPhone ? (
          <AuthBrandPanel
            eyebrow="NEW ACCOUNT"
            title="Your email is confirmed."
            description="Add your name and mobile number so providers and support can reach you about your bookings."
          />
        ) : null}
        <View style={[styles.formColumn, !isPhone && styles.formColumnWide]}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">Create your account</Text>
            <Text style={styles.subtitle}>
              Email confirmed: <Text style={styles.email}>{email ?? ''}</Text>
            </Text>
          </View>
          <Card style={styles.form}>
            <Input
              label="First name"
              value={firstName}
              onChangeText={(text) => { setFirstName(text); setErrors({}); }}
              autoComplete="given-name"
              textContentType="givenName"
              maxLength={100}
              error={errors.firstName}
              testID="create-account-first-name"
            />
            <Input
              label="Last name"
              value={lastName}
              onChangeText={(text) => { setLastName(text); setErrors({}); }}
              autoComplete="family-name"
              textContentType="familyName"
              maxLength={100}
              error={errors.lastName}
              testID="create-account-last-name"
            />
            <PhoneInput
              value={phone}
              onChange={(text) => { setPhone(text); setErrors({}); }}
              label="Mobile number"
              errorVisible={Boolean(errors.phone)}
              testID="create-account-phone"
            />
            {errors.phone ? <Text style={styles.error}>{errors.phone}</Text> : null}
            <Text style={styles.hint}>
              Used so providers and support can contact you. We will not text you a code.
            </Text>
            {errors.form ? <Text style={styles.error} accessibilityRole="alert" testID="create-account-error">{errors.form}</Text> : null}
            <Button title="Create account" onPress={() => { void handleCreate(); }} loading={loading} />
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' },
  contentWide: { flexDirection: 'row', justifyContent: 'center' },
  formColumn: { width: '100%', maxWidth: 520 },
  formColumnWide: { flex: 1, paddingHorizontal: 64 },
  header: { marginBottom: spacing.xl },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary },
  email: { fontWeight: '600', color: colors.text },
  form: { gap: spacing.base, borderRadius: borderRadius.lg },
  hint: { ...typography.bodySmall, color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.error },
});
