import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { colors } from '@/config/theme';
import { useTranslation } from '@/i18n/useTranslation';

interface LazyImageProps {
  source: string | null | undefined;
  style?: ImageStyle;
  containerStyle?: ViewStyle;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none';
  transition?: number;
  blurhash?: string;
  accessibilityLabel?: string;
}

const DEFAULT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export function LazyImage({
  source,
  style,
  containerStyle,
  contentFit = 'cover',
  transition = 200,
  blurhash = DEFAULT_BLURHASH,
  accessibilityLabel,
}: LazyImageProps): React.ReactElement {
  const [hasError, setHasError] = useState(false);
  const { t } = useTranslation();

  if (!source || hasError) {
    return (
      <View
        style={[styles.placeholder, containerStyle, style as ViewStyle]}
        accessible={true}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? t('accessibility.imageUnavailable')}
      >
        <Text style={styles.placeholderIcon} accessibilityElementsHidden={true}>📷</Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, containerStyle]}
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? t('accessibility.image')}
    >
      <Image
        source={source}
        style={[styles.image, style]}
        contentFit={contentFit}
        transition={transition}
        placeholder={{ blurhash }}
        onError={() => setHasError(true)}
        recyclingKey={source}
        cachePolicy="disk"
        accessibilityLabel={accessibilityLabel ?? t('accessibility.image')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 24,
    opacity: 0.4,
  },
});
