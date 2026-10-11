import React, { useRef, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Input } from '@/components/ui';
import { getErrorMessage } from '@/utils/errors';
import { ApiError } from '@/services/api';
import { useCaptchaEmailCode } from '@/hooks/useCaptchaEmailCode';
import { useEmailSignInFlow } from '@/stores/email-signin.store';
import { Routes } from '@/config/navigation';
import { colors, spacing, typography } from '@/config/theme';

/**
 * D37 (Ken, 2026-10-11): the email half of the sign-in screens while phone
 * codes are paused. One form serves both "Log in" and "Create account":
 * the server sends a 6-digit code either way, and only after the code is
 * accepted does it say whether the email already has an account.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_SHAPE.test(trimmed);
}

interface Props {
  mode: 'login' | 'register';
}

export default function EmailSignInForm({ mode }: Props): React.ReactElement {
  const router = useRouter();
  const { requestEmailCodeWithCaptcha, captchaModal } = useCaptchaEmailCode();
  const startFlow = useEmailSignInFlow(state => state.start);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const handleSend = async (): Promise<void> => {
    // A second Enter while sending is ignored, not shown as an error.
    if (inFlight.current) return;
    setError('');
    const address = email.trim();
    if (!isPlausibleEmail(address)) {
      setError('Enter a valid email address, for example juan@gmail.com');
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      const receipt = await requestEmailCodeWithCaptcha(address);
      // The address travels in memory, not in the route, so it never lands
      // in the browser's address bar or history.
      startFlow(address, mode, receipt);
      router.push(Routes.AUTH.EMAIL_VERIFY);
    } catch (err: unknown) {
      // A code sent a moment ago (e.g. before going Back) is still valid: go
      // straight to entering it instead of a dead end.
      const pending = err instanceof ApiError
        ? (err.body?.error as { codePending?: unknown; expiresInMs?: unknown; retryAfterMs?: unknown } | undefined) : undefined;
      if (pending?.codePending === true && typeof pending.expiresInMs === 'number' && pending.expiresInMs > 0) {
        startFlow(address, mode, {
          expiresInMs: pending.expiresInMs,
          resendInMs: typeof pending.retryAfterMs === 'number' ? pending.retryAfterMs : 0,
        }, { alreadySent: true });
        router.push(Routes.AUTH.EMAIL_VERIFY);
        return;
      }
      setError(getErrorMessage(err, "We couldn't send the code. Please try again."));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <>
      <Input
        label="Email address"
        value={email}
        onChangeText={(text) => { setEmail(text); setError(''); }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        inputMode="email"
        returnKeyType="send"
        onSubmitEditing={() => { void handleSend(); }}
        maxLength={254}
        error={error || undefined}
        testID="email-signin-input"
      />
      <Text style={styles.hint}>
        We'll email you a 6-digit code. It works for 5 minutes.
      </Text>
      <Button
        title={mode === 'register' ? 'Email me a code to create my account' : 'Email me a sign-in code'}
        onPress={() => { void handleSend(); }}
        loading={loading}
        disabled={email.trim().length < 5}
      />
      {captchaModal}
    </>
  );
}

const styles = StyleSheet.create({
  hint: { ...typography.bodySmall, color: colors.textSecondary, marginTop: -spacing.xs },
});
