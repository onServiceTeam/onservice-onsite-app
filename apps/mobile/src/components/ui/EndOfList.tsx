import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '@/i18n/useTranslation';
import { colors } from '@/config/theme';

interface EndOfListProps {
  message?: string;
}

export function EndOfList({ message }: EndOfListProps): React.ReactElement {
  const { t } = useTranslation();
  const displayMessage = message ?? t('common.endOfList');
  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={displayMessage}
    >
      <View style={styles.line} />
      <Text style={styles.text} maxFontSizeMultiplier={2}>{displayMessage}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 32,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  text: {
    marginHorizontal: 12,
    fontSize: 13,
    color: colors.textTertiary,
    fontWeight: '500',
  },
});
