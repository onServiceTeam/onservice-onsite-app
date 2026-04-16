import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps } from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { MIN_TOUCH_TARGET } from '@/config/accessibility';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

export default function Input({ label, error, hint, style, ...props }: InputProps): React.ReactElement {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="none"
    >
      {label && (
        <Text
          style={styles.label}
          nativeID={`input-label-${label}`}
          maxFontSizeMultiplier={2}
        >
          {label}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : undefined,
          style,
        ]}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label ?? props.placeholder}
        accessibilityHint={hint}
        accessibilityState={{ disabled: props.editable === false }}
        accessibilityLabelledBy={label ? `input-label-${label}` : undefined}
        maxFontSizeMultiplier={2}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
      {error && (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={2}
        >
          {error}
        </Text>
      )}
      {!error && hint && (
        <Text style={styles.hint} maxFontSizeMultiplier={2}>{hint}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.base },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.error },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },
});
