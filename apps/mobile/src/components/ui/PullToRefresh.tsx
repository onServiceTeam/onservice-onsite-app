import React, { useState, useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { hapticLight } from '@/utils/haptics';
import { colors } from '@/config/theme';
import { useTranslation } from '@/i18n/useTranslation';

interface PullToRefreshProps extends ScrollViewProps {
  onRefresh: () => Promise<void>;
  tintColor?: string;
  children: React.ReactNode;
}

export function PullToRefresh({
  onRefresh,
  tintColor = colors.primary,
  children,
  ...rest
}: PullToRefreshProps): React.ReactElement {
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await hapticLight();
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <ScrollView
      {...rest}
      style={[styles.fill, rest.style]}
      accessibilityHint={t('accessibility.pullToRefresh')}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={tintColor}
          colors={[tintColor]}
          accessibilityLabel={refreshing ? t('accessibility.refreshingContent') : t('accessibility.pullToRefresh')}
        />
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
