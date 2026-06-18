import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '@/config/theme';
import { MIN_TOUCH_TARGET } from '@/config/accessibility';
import { hapticLight } from '@/utils/haptics';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style,
  textStyle,
  fullWidth = true,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps): React.ReactElement {
  const isDisabled = disabled || loading;

  const handlePress = (): void => {
    void hapticLight();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? colors.primary : colors.white}
        />
      ) : (
        <Text
          style={[
            styles.text,
            styles[`text_${variant}`],
            styles[`textSize_${size}`],
            isDisabled && styles.textDisabled,
            textStyle,
          ]}
          maxFontSizeMultiplier={2}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
  },
  fullWidth: { width: '100%' },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.secondary },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  ghost: { backgroundColor: 'transparent' },
  size_sm: { minHeight: MIN_TOUCH_TARGET, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  size_md: { minHeight: MIN_TOUCH_TARGET, paddingVertical: spacing.md + 2, paddingHorizontal: spacing.lg },
  size_lg: { minHeight: MIN_TOUCH_TARGET + 8, paddingVertical: spacing.base, paddingHorizontal: spacing.xl },
  disabled: { opacity: 0.5 },
  text: { ...typography.button, textAlign: 'center' },
  text_primary: { color: colors.white },
  text_secondary: { color: colors.white },
  text_outline: { color: colors.primary },
  text_ghost: { color: colors.primary },
  textSize_sm: { fontSize: 14 },
  textSize_md: { fontSize: 16 },
  textSize_lg: { fontSize: 18 },
  textDisabled: { opacity: 0.7 },
});
