/**
 * Phase 14 Dispatch 11 — PhoneInput
 *
 * Pattern 6 (form validation client-only) + Pattern 4 (i18n) for the
 * Philippine mobile-number flows in auth/login.tsx + auth/register.tsx.
 * Mirrors the server-side regex in packages/api so client validation
 * never accepts what the server would reject.
 */

import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/config/theme';
import { i18n } from '@/lib/i18n';
import { showToast } from '@/lib/toast';

// Phase K MED-K16 fix — accept the +63 prefix that utils/phone.
// validatePHPhone accepts. Pre-fix this regex was `^(09|9)\d{9}$`
// only, so users typing "+639171234567" got rejected by the
// PhoneInput even though both backend AND validatePHPhone accept
// that form. The two regexes are now consistent.
export const PH_MOBILE_REGEX = /^(\+63|0)?9\d{9}$/;

export function normalizePhilippineMobile(input: string): string {
  // Preserve a leading + so '+639' digits aren't stripped by the
  // \D filter (which treats + as non-digit).
  const cleaned = input.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+63')) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.startsWith('09')) return `+63${digits.slice(1)}`;
  if (digits.startsWith('9') && digits.length === 10) return `+63${digits}`;
  if (digits.startsWith('63')) return `+${digits}`;
  return digits;
}

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  errorVisible?: boolean;
  testID?: string;
}

export function PhoneInput({
  value,
  onChange,
  label,
  hint,
  errorVisible,
  testID,
}: PhoneInputProps): React.ReactElement {
  const isValid = PH_MOBILE_REGEX.test(value.replace(/\s/g, ''));

  return (
    <View style={styles.container} testID={testID}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <Pressable
          style={styles.countryCode}
          accessibilityRole="button"
          accessibilityLabel="+63 (Philippines)"
          onPress={() => showToast(i18n.t('auth.login.ph_only_for_now') || 'PH only for v1.0', 'info')}
        >
          <Text style={styles.countryCodeText}>+63</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="9XX XXX XXXX"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={13}
          accessibilityLabel={label ?? 'Phone number'}
          accessibilityHint={hint}
        />
      </View>
      {errorVisible && value.length > 0 && !isValid ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          Please enter a valid Philippine mobile number.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { ...typography.bodySmall, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  countryCode: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  countryCodeText: { ...typography.body, color: colors.text },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  errorText: { ...typography.bodySmall, color: colors.error },
});

export default PhoneInput;
