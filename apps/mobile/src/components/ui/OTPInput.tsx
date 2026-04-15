import React, { useRef, useState } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/config/theme';
import { useTranslation } from '@/i18n/useTranslation';

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  accessibilityLabel?: string;
}

export default function OTPInput({
  length = 6,
  value,
  onChange,
  error,
  accessibilityLabel,
}: OTPInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const { t } = useTranslation();

  const digits = value.split('').concat(Array(length - value.length).fill(''));

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessible={true}
      accessibilityRole="keyboardkey"
      accessibilityLabel={
        accessibilityLabel ??
        t('accessibility.otpInput', { entered: String(value.length), total: String(length) })
      }
      accessibilityHint={t('accessibility.otpHint')}
    >
      <View style={styles.container}>
        {digits.slice(0, length).map((digit, idx) => (
          <View
            key={idx}
            style={[
              styles.cell,
              focused && idx === value.length && styles.cellFocused,
              error && styles.cellError,
              digit !== '' && styles.cellFilled,
            ]}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={styles.cellText} maxFontSizeMultiplier={2}>
              {digit}
            </Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={(text) => {
          const filtered = text.replace(/\D/g, '').slice(0, length);
          onChange(filtered);
        }}
        keyboardType="number-pad"
        maxLength={length}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus
        accessibilityLabel={t('accessibility.otpEnter', { length: String(length) })}
        textContentType="oneTimeCode"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  cell: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
  },
  cellFocused: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  cellError: { borderColor: colors.error },
  cellFilled: { borderColor: colors.primary, backgroundColor: colors.background },
  cellText: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
});
